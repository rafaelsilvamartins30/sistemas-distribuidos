# frozen_string_literal: true

# Lists and reviews professor verification requests within a department.
class DepartmentProfessorVerificationRequestsController < ApplicationController
  include KeycloakAuthenticated

  REQUEST_TYPE = InstitutionalRequest::PROFESSOR_VERIFICATION

  def index
    department = Department.find_by(id: params[:department_id])
    return render_problem(:not_found, 'Department not found') unless department

    unless department.administered_by?(current_subject)
      return render_problem(:forbidden, 'Department administrator access is required')
    end

    render json: { items: pending_requests(department) }
  end

  def approve
    review_request do |verification, profile|
      return render_problem(:conflict, 'Professor already has an affiliation with another department') unless
        activate_affiliation(profile, verification.target_department_id)

      verification.update!(status: InstitutionalRequest::APPROVED,
                           reviewed_at: Time.current,
                           reviewed_by_user_id: current_subject)
      CampusNotifications.request_decided!(verification, current_subject)
      render json: verification.opportunity_verification_json(profile)
    end
  end

  def reject
    review_request do |verification, profile|
      verification.update!(status: InstitutionalRequest::REJECTED,
                           reviewed_at: Time.current,
                           reviewed_by_user_id: current_subject)
      CampusNotifications.request_decided!(verification, current_subject)
      render json: verification.opportunity_verification_json(profile)
    end
  end

  private

  def pending_requests(department)
    InstitutionalRequest.pending.where(type: REQUEST_TYPE, target_department_id: department.id)
                        .order(:created_at, :id).map do |verification|
      profile = UserProfile.find_by(keycloak_user_id: verification.requested_by_user_id)
      verification.opportunity_verification_json(profile)
    end
  end

  def review_request
    InstitutionalRequest.transaction do
      verification = reviewable_request
      next unless verification

      profile = UserProfile.find_by(keycloak_user_id: verification.requested_by_user_id)
      return render_problem(:conflict, 'Requesting user profile no longer exists') unless profile

      yield verification, profile
    end
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'Professor affiliation could not be updated')
  end

  def reviewable_request
    verification = InstitutionalRequest.lock.find_by(id: params[:id], type: REQUEST_TYPE)
    return request_not_found unless verification
    return unless department_admin_for_request?(verification)
    return unless pending_request_is_reviewable?(verification)

    verification
  end

  def request_not_found
    render_problem(:not_found, 'Professor verification request not found')
    nil
  end

  def department_admin_for_request?(verification)
    return true if verification.target_department.administered_by?(current_subject)

    render_problem(:forbidden, 'Department administrator access is required')
    false
  end

  def pending_request_is_reviewable?(verification)
    return true if verification.status == InstitutionalRequest::PENDING

    render_problem(:conflict, 'Professor verification request is no longer pending')
    false
  end

  def activate_affiliation(profile, department_id)
    affiliation = ProfessorAffiliation.find_by(user_id: profile.id)
    return false if affiliation && affiliation.department_id != department_id

    affiliation ||= ProfessorAffiliation.new(
      user_id: profile.id,
      department_id: department_id,
      joined_at: Time.current
    )
    affiliation.update!(status: 'ACTIVE')
  end
end
