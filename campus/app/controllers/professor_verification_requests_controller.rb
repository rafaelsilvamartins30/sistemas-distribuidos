# frozen_string_literal: true

# Accepts the self-service request for department review.
class ProfessorVerificationRequestsController < ApplicationController
  include KeycloakAuthenticated

  wrap_parameters false

  REQUEST_TYPE = InstitutionalRequest::PROFESSOR_VERIFICATION

  def index
    requests = InstitutionalRequest.where(requested_by_user_id: current_subject, type: REQUEST_TYPE)
                                   .includes(:target_department)
                                   .order(created_at: :desc)
    profile = UserProfile.find_by(keycloak_user_id: current_subject)

    render json: { items: requests.map { |verification| verification.opportunity_verification_json(profile) } }
  end

  def create
    payload = request.request_parameters
    return render_problem(:bad_request, 'Request body must be empty') unless valid_request_payload?(payload)

    profile = UserProfile.find_by(keycloak_user_id: current_subject)
    return render_problem(:not_found, 'UNIR user profile is required') unless profile

    department = profile.department
    return render_problem(:bad_request, 'Profile department must match an existing Campus department') unless department

    create_request(profile, department)
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'Professor verification request is already pending')
  end

  private

  def valid_request_payload?(payload)
    payload.is_a?(Hash) && payload.empty?
  end

  def create_request(profile, department)
    conflict = affiliation_conflict(profile, department)
    return render_problem(:conflict, conflict) if conflict

    if pending_request?(department)
      return render_problem(:conflict, 'Professor verification request is already pending')
    end

    create_verification(profile, department)
  end

  def affiliation_conflict(profile, department)
    affiliation = profile.professor_affiliation
    return 'Professor already has an active department affiliation' if affiliation&.status == 'ACTIVE'

    return unless affiliation && affiliation.department_id != department.id

    'Professor already has an affiliation with another department'
  end

  def pending_request?(department)
    InstitutionalRequest.pending.exists?(requested_by_user_id: current_subject,
                                         target_department_id: department.id,
                                         type: REQUEST_TYPE)
  end

  def create_verification(profile, department)
    verification = build_verification(profile, department)
    persist_verification(verification)
    render json: verification.opportunity_verification_json(profile), status: :created
  rescue ActiveRecord::RecordInvalid
    render_problem(:bad_request, 'Professor verification request is invalid')
  end

  def build_verification(profile, department)
    InstitutionalRequest.new(
      type: REQUEST_TYPE,
      title: "Verificação docente — #{profile.name}",
      requested_by_user_id: current_subject,
      target_department_id: department.id,
      payload_json: { identifier: profile.registration_code },
      status: InstitutionalRequest::PENDING
    )
  end

  def persist_verification(verification)
    InstitutionalRequest.transaction do
      verification.save!
      CampusNotifications.request_submitted!(verification)
    end
  end
end
