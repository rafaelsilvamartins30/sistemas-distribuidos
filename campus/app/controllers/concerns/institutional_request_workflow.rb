# frozen_string_literal: true

# Builds and lists Campus institutional requests.
module InstitutionalRequestWorkflow
  extend ActiveSupport::Concern

  private

  def pending_requests
    return InstitutionalRequest.pending.order(:created_at, :id) if global_platform_admin?

    requests = InstitutionalRequest.pending.where(target_department_id: department_admin_ids)
    requests = requests.or(InstitutionalRequest.pending.where(target_department_id: nil)) if university_admin?
    requests.includes(:target_department).order(:created_at, :id)
  end

  def department_admin_ids
    Department.all.select { |department| department.administrator_user_ids.include?(current_subject) }.map(&:id)
  end

  def university_admin?
    global_platform_admin?
  end

  def validated_request_payload
    payload = request.request_parameters
    error = request_payload_error(payload)
    return payload unless error

    render_problem(error.fetch(:status), error.fetch(:message))
    nil
  end

  def request_payload_error(payload)
    return { status: :bad_request, message: 'Invalid request body' } unless valid_envelope?(payload)
    return unsupported_type_error unless InstitutionalRequestProfiles::PROFILE_REQUESTS.include?(payload['type'])
    return missing_target_department_error(payload) unless existing_target_department?(payload)
    return invalid_profile_payload_error unless valid_profile_payload?(payload['type'], payload['payload'])
    return duplicate_request_error if matching_pending?(payload['type'], payload['targetDepartmentId'])

    nil
  end

  def unsupported_type_error
    { status: :bad_request, message: 'Only community and academic entity requests are accepted here' }
  end

  def existing_target_department?(payload)
    target_id = payload['targetDepartmentId']
    target_id.blank? || Department.exists?(id: target_id)
  end

  def missing_target_department_error(payload)
    { status: :not_found, message: 'Target department not found' } if payload['targetDepartmentId'].present?
  end

  def invalid_profile_payload_error
    { status: :bad_request, message: 'Invalid profile request payload' }
  end

  def duplicate_request_error
    { status: :conflict, message: 'A matching request is already pending' }
  end

  def submit_request!(payload)
    record = build_request(payload)
    InstitutionalRequest.transaction do
      record.save!
      CampusNotifications.request_submitted!(record)
    end
    record
  end

  def build_request(payload)
    InstitutionalRequest.new(
      id: SecureRandom.uuid, type: payload['type'], title: payload['payload']['name'],
      requested_by_user_id: current_subject, target_department_id: payload['targetDepartmentId'],
      payload_json: payload['payload'], status: InstitutionalRequest::PENDING
    )
  end

  def request_page_values
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '20'), 10)
    return render_problem(:bad_request, 'Invalid request list parameters') unless page >= 0 && size.between?(1, 100)

    [page, size]
  end

  def paginated_requests(scope, page, size, &)
    total = scope.count
    { items: scope.offset(page * size).limit(size).map(&), page: page, size: size,
      totalElements: total, totalPages: (total.to_f / size).ceil }
  end
end
