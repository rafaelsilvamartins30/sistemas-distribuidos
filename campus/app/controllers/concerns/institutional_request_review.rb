# frozen_string_literal: true

# Applies administrator decisions to institutional profile requests.
module InstitutionalRequestReview
  extend ActiveSupport::Concern

  private

  def matching_pending?(type, target_id)
    InstitutionalRequest.pending.where(type: type, requested_by_user_id: current_subject)
                        .exists?(target_department_id: target_id)
  end

  def create_requested_profile!(record)
    attributes = requested_profile_attributes(record)
    return create_requested_community!(record, attributes) if record.type == 'COMMUNITY_CREATION'

    create_requested_entity!(record, attributes)
  end

  def requested_profile_attributes(record)
    payload = record.payload_json
    {
      name: payload.fetch('name'), description: payload.fetch('description'),
      general_info_markdown: payload.fetch('generalInfoMarkdown'), logo_url: payload['logoUrl'],
      banner_url: payload['bannerUrl'], links: payload.fetch('links', []),
      administrator_user_ids: [record.requested_by_user_id], department_id: record.target_department_id
    }
  end

  def create_requested_community!(record, attributes)
    Community.create!(id: SecureRandom.uuid, category: record.payload_json['category'], **attributes)
  end

  def create_requested_entity!(record, attributes)
    AcademicEntity.create!(id: SecureRandom.uuid, entity_type: record.payload_json.fetch('entityType'), **attributes)
  end

  def activate_professor!(record)
    department = required_target_department!(record)
    profile = required_requester_profile!(record)
    affiliation = active_affiliation(profile, department)
    affiliation.update!(status: 'ACTIVE')
    profile
  end

  def required_target_department!(record)
    return record.target_department if record.target_department

    raise ActiveRecord::RecordNotFound, 'Professor request has no target department'
  end

  def required_requester_profile!(record)
    profile = UserProfile.find_by(keycloak_user_id: record.requested_by_user_id)
    return profile if profile

    raise ActiveRecord::RecordNotFound, 'Requesting professor profile no longer exists'
  end

  def active_affiliation(profile, department)
    affiliation = ProfessorAffiliation.find_by(user_id: profile.id)
    unless affiliation
      return ProfessorAffiliation.new(user_id: profile.id, department: department,
                                      joined_at: Time.current)
    end
    return affiliation if affiliation.department_id == department.id

    affiliation.errors.add(:department_id, :invalid)
    raise ActiveRecord::RecordInvalid, affiliation
  end

  def can_review?(record)
    return true if global_platform_admin?
    return record.target_department.administrator_user_ids.include?(current_subject) if record.target_department_id

    false
  end

  def approve_request!(record)
    created = approved_profile(record)
    record.update!(status: InstitutionalRequest::APPROVED, reviewed_at: Time.current,
                   reviewed_by_user_id: current_subject)
    CampusNotifications.request_decided!(record, current_subject)
    created
  end

  def approved_profile(record)
    return activate_professor!(record) if record.type == InstitutionalRequest::PROFESSOR_VERIFICATION

    create_requested_profile!(record)
  end

  def approval_response(record, created)
    record.api_json.merge(createdProfile: {
                            type: approved_profile_type(record), id: created.id, name: created.name,
                            departmentId: record.target_department_id
                          })
  end

  def approved_profile_type(record)
    { 'COMMUNITY_CREATION' => 'COMMUNITY', 'ENTITY_CREATION' => 'ACADEMIC_ENTITY' }
      .fetch(record.type, 'PROFESSOR_AFFILIATION')
  end

  def reviewable_request(record_id)
    record = InstitutionalRequest.lock.find_by(id: record_id)
    unless record
      render_problem(:not_found, 'Institutional request not found')
      return
    end
    return unless authorized_to_review?(record)
    return unless pending_for_review?(record)

    record
  end

  def pending_for_review?(record)
    return true if record.status == InstitutionalRequest::PENDING

    render_problem(:conflict, 'Request is no longer pending')
    false
  end

  def authorized_to_review?(record)
    return true if can_review?(record)

    render_problem(:forbidden, 'Administrator access to the request target is required')
    false
  end
end
