# frozen_string_literal: true

# Creates and reviews community/entity requests against their owning institution.
class InstitutionalRequestsController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization

  wrap_parameters false

  PROFILE_REQUESTS = %w[COMMUNITY_CREATION ENTITY_CREATION].freeze
  PROFILE_FIELDS = %w[name description generalInfoMarkdown logoUrl bannerUrl links category entityType].freeze

  def index
    requests = InstitutionalRequest.where(requested_by_user_id: current_subject).order(created_at: :desc)
    render_requests(requests) { |item| item.api_json }
  end

  def pending
    ids = Department.all.select { |department| department.administrator_user_ids.include?(current_subject) }.map(&:id)
    university_admin = University.current&.administrator_user_ids&.include?(current_subject)
    requests = InstitutionalRequest.pending.where(target_department_id: ids)
    requests = requests.or(InstitutionalRequest.pending.where(target_department_id: nil)) if university_admin
    render_requests(requests.includes(:target_department).order(:created_at, :id)) { |item| item.api_json }
  end

  def create
    payload = request.request_parameters
    return render_problem(:bad_request, 'Invalid request body') unless valid_envelope?(payload)

    type = payload['type']
    return render_problem(:bad_request, 'Only community and academic entity requests are accepted here') unless
      PROFILE_REQUESTS.include?(type)

    target_id = payload['targetDepartmentId']
    department = target_id.present? ? Department.find_by(id: target_id) : nil
    return render_problem(:not_found, 'Target department not found') if target_id.present? && !department
    return render_problem(:bad_request, 'Invalid profile request payload') unless valid_profile_payload?(type, payload['payload'])
    return render_problem(:conflict, 'A matching request is already pending') if matching_pending?(type, target_id)

    record = InstitutionalRequest.new(
      id: SecureRandom.uuid, type: type, title: payload['payload']['name'],
      requested_by_user_id: current_subject, target_department_id: target_id,
      payload_json: payload['payload'], status: InstitutionalRequest::PENDING
    )
    InstitutionalRequest.transaction do
      record.save!
      CampusNotifications.request_submitted!(record)
    end
    render json: record.api_json, status: :created
  rescue ActiveRecord::RecordInvalid
    render_problem(:unprocessable_entity, 'Institutional request is invalid')
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'A matching request is already pending')
  end

  def approve
    review do |record|
      created = if record.type == InstitutionalRequest::PROFESSOR_VERIFICATION
                  activate_professor!(record)
                else
                  create_requested_profile!(record)
                end
      record.update!(status: InstitutionalRequest::APPROVED, reviewed_at: Time.current,
                     reviewed_by_user_id: current_subject)
      CampusNotifications.request_decided!(record, current_subject)
      render json: record.api_json.merge(createdProfile: {
        type: if record.type == 'COMMUNITY_CREATION' then 'COMMUNITY'
                elsif record.type == 'ENTITY_CREATION' then 'ACADEMIC_ENTITY'
                else 'PROFESSOR_AFFILIATION'
                end,
        id: created.id, name: created.name, departmentId: record.target_department_id
      })
    end
  end

  def reject
    review do |record|
      record.update!(status: InstitutionalRequest::REJECTED, reviewed_at: Time.current,
                     reviewed_by_user_id: current_subject)
      CampusNotifications.request_decided!(record, current_subject)
      render json: record.api_json
    end
  end

  private

  def valid_envelope?(payload)
    payload.is_a?(Hash) && (payload.keys - %w[type targetDepartmentId payload]).empty? &&
      payload['type'].is_a?(String) &&
      (!payload.key?('targetDepartmentId') || payload['targetDepartmentId'].nil? ||
        payload['targetDepartmentId'].is_a?(String)) && payload['payload'].is_a?(Hash)
  end

  def valid_profile_payload?(type, value)
    allowed = PROFILE_FIELDS - (type == 'COMMUNITY_CREATION' ? %w[entityType] : %w[category])
    return false unless (value.keys - allowed).empty?
    return false unless %w[name description generalInfoMarkdown].all? { |field| value[field].is_a?(String) && value[field].present? }
    return false unless %w[logoUrl bannerUrl category entityType].all? { |field| value[field].nil? || value[field].is_a?(String) }
    return false if value.key?('links') && (!value['links'].is_a?(Array) || !value['links'].all?(String))
    return false if type == 'ENTITY_CREATION' && value['entityType'].blank?

    true
  end

  def matching_pending?(type, target_id)
    scope = InstitutionalRequest.pending.where(type: type, requested_by_user_id: current_subject)
    target_id.nil? ? scope.where(target_department_id: nil).exists? : scope.where(target_department_id: target_id).exists?
  end

  def create_requested_profile!(record)
    payload = record.payload_json
    attributes = {
      name: payload.fetch('name'), description: payload.fetch('description'),
      general_info_markdown: payload.fetch('generalInfoMarkdown'), logo_url: payload['logoUrl'],
      banner_url: payload['bannerUrl'], links: payload.fetch('links', []),
      administrator_user_ids: [record.requested_by_user_id], department_id: record.target_department_id
    }
    if record.type == 'COMMUNITY_CREATION'
      Community.create!(id: SecureRandom.uuid, category: payload['category'], **attributes)
    else
      AcademicEntity.create!(id: SecureRandom.uuid, entity_type: payload.fetch('entityType'), **attributes)
    end
  end

  def activate_professor!(record)
    department = record.target_department
    raise ActiveRecord::RecordNotFound, 'Professor request has no target department' unless department
    profile = UserProfile.find_by(keycloak_user_id: record.requested_by_user_id)
    raise ActiveRecord::RecordNotFound, 'Requesting professor profile no longer exists' unless profile

    affiliation = ProfessorAffiliation.find_by(user_id: profile.id)
    if affiliation && affiliation.department_id != department.id
      affiliation.errors.add(:department_id, :invalid)
      raise ActiveRecord::RecordInvalid.new(affiliation)
    end
    affiliation ||= ProfessorAffiliation.new(user_id: profile.id, department: department, joined_at: Time.current)
    affiliation.update!(status: 'ACTIVE')
    profile
  end

  def review
    InstitutionalRequest.transaction do
      record = InstitutionalRequest.lock.find_by(id: params[:id])
      return render_problem(:not_found, 'Institutional request not found') unless record
      return render_problem(:conflict, 'Request is no longer pending') unless record.status == InstitutionalRequest::PENDING
      return render_problem(:forbidden, 'Administrator access to the request target is required') unless can_review?(record)

      yield record
    end
  rescue ActiveRecord::RecordInvalid => error
    render_problem(:unprocessable_entity, "Request could not be completed: #{error.record.errors.attribute_names.uniq.sort.join(', ')}")
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'A profile for this request already exists')
  rescue ActiveRecord::RecordNotFound => error
    render_problem(:conflict, error.message)
  end

  def can_review?(record)
    return record.target_department.administrator_user_ids.include?(current_subject) if record.target_department_id

    university = University.current
    university&.administrator_user_ids&.include?(current_subject)
  end

  def render_requests(scope)
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '20'), 10)
    return render_problem(:bad_request, 'Invalid request list parameters') unless page >= 0 && size.between?(1, 100)

    total = scope.count
    render json: { items: scope.offset(page * size).limit(size).map { |item| yield item }, page: page, size: size,
                   totalElements: total, totalPages: (total.to_f / size).ceil }
  rescue ArgumentError, TypeError
    render_problem(:bad_request, 'Invalid request list parameters')
  end
end
