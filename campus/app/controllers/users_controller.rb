# frozen_string_literal: true

# Profile endpoints implementing the existing public HTTP contract.
class UsersController < ApplicationController
  include KeycloakAuthenticated
  include UserProfiles::ApiContract

  wrap_parameters false

  def index
    return index_by_subjects if params.key?(:subjects)
    unless global_platform_admin?
      return render_problem(:forbidden, 'Only the platform administrator can list the user directory')
    end

    render json: { items: directory_scope.limit(200).map { |profile| directory_item(profile) } }
  end

  def create
    payload = validated_profile_payload(CREATE_FIELDS, required: true)
    return unless payload

    profile = UserProfile.new(create_attributes(payload, current_subject))
    return render(json: profile_response(profile), status: :created) if profile.save

    render_save_error(profile)
  rescue ActiveRecord::RecordNotUnique
    render_create_conflict
  end

  def show_me
    profile = find_my_profile
    return unless profile

    render json: profile_response(profile, include_token_claims: true)
  end

  def update_me
    profile = find_my_profile
    return unless profile

    payload = validated_profile_payload(UPDATE_FIELDS, required: false, profile: profile)
    return unless payload

    profile.assign_attributes(profile_update_attributes(payload))
    return render(json: profile_response(profile, include_token_claims: true)) if profile.save

    render_save_error(profile)
  end

  private

  def validated_profile_payload(fields, required:, profile: nil)
    payload = load_payload(fields)
    return nil unless payload

    if reserved_institutional_id?(payload)
      render_problem(:forbidden, 'Institutional ID is reserved')
      return nil
    end
    return payload if valid_catalog_relations?(payload, profile: profile, required: required)

    render_problem(:bad_request, 'Course must belong to the selected department')
    nil
  end

  def index_by_subjects
    subjects = params[:subjects]
    unless subjects.is_a?(Array) && subjects.length.between?(1, 100) && subjects.all?(String)
      return render_problem(:bad_request, 'Invalid subjects')
    end

    profiles = UserProfile.where(keycloak_user_id: subjects).order(:name).limit(200)
    render json: { items: profiles.map { |profile| subject_lookup_item(profile) } }
  end

  def subject_lookup_item(profile)
    return directory_item(profile) if global_platform_admin?

    { keycloakUserId: profile.keycloak_user_id, name: profile.name }
  end

  def reserved_institutional_id?(payload)
    raw = payload['institutionalId']
    code = ProtectGlobalAdministrator::GLOBAL_ADMIN_REGISTRATION_CODE
    return false unless raw.is_a?(String) && raw.strip.casecmp?(code)

    !platform_admin_role?
  end

  def find_my_profile
    UserProfile.find_by(keycloak_user_id: current_subject).tap do |profile|
      render_problem(:not_found, 'UNIR user not found') unless profile
    end
  end

  def valid_catalog_relations?(payload, required:, profile: nil)
    course_id = payload.fetch('courseId', profile&.course_id)
    department_id = payload.fetch('departmentId', profile&.department_id)
    return true if course_id.blank? && department_id.blank? && !required
    return false unless course_id.present? && department_id.present?

    Course.exists?(id: course_id, department_id: department_id, reference_only: false)
  end

  def render_save_error(profile)
    return render_problem(:conflict, 'User already exists') if profile.errors.of_kind?(:keycloak_user_id, :taken)
    if profile.errors.of_kind?(:registration_code, :taken)
      return render_problem(:conflict, 'Institutional ID already exists')
    end

    render_invalid_profile(profile)
  end

  def directory_scope
    scope = UserProfile.order(:name)
    query = params[:q].to_s.strip
    return scope if query.blank?

    scope.where('name ILIKE :q OR registration_code ILIKE :q', q: "%#{ActiveRecord::Base.sanitize_sql_like(query)}%")
  end

  def directory_item(profile)
    { id: profile.id, keycloakUserId: profile.keycloak_user_id, name: profile.name,
      registrationCode: profile.registration_code, userType: profile.user_type }
  end

  def render_create_conflict
    taken = UserProfile.exists?(keycloak_user_id: current_subject)
    render_problem(:conflict, taken ? 'User already exists' : 'Institutional ID already exists')
  end
end
