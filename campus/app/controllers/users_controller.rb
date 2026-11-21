# frozen_string_literal: true

# Profile endpoints implementing the existing public HTTP contract.
class UsersController < ApplicationController
  include UserProfiles::ApiContract

  wrap_parameters false

  before_action :authenticate_keycloak!

  def index
    roles = Array(@token_claims.dig('realm_access', 'roles'))
    return render_problem(:forbidden, 'Platform administrator role is required') unless roles.include?('PLATFORM_ADMIN')

    profiles = UserProfile.order(:name).limit(200).map do |profile|
      { id: profile.id, keycloakUserId: profile.keycloak_user_id, name: profile.name,
        registrationCode: profile.registration_code, userType: profile.user_type }
    end
    render json: { items: profiles }
  end

  def create
    payload = load_payload(CREATE_FIELDS)
    return unless payload
    unless valid_catalog_relations?(payload, required: true)
      return render_problem(:bad_request, 'Course must belong to the selected department')
    end

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
    payload = load_payload(UPDATE_FIELDS)
    return unless payload

    profile = find_my_profile
    return unless profile
    unless valid_catalog_relations?(payload, profile: profile, required: false)
      return render_problem(:bad_request, 'Course must belong to the selected department')
    end

    profile.assign_attributes(profile_update_attributes(payload))
    return render(json: profile_response(profile, include_token_claims: true)) if profile.save

    render_save_error(profile)
  end

  private

  def authenticate_keycloak!
    match = request.authorization.to_s.match(/\ABearer\s+(\S+)\z/i)
    return render_problem(:unauthorized, 'Bearer token is required') unless match

    @token_claims = KeycloakJwt.decode(match[1])
  rescue JWT::DecodeError, JWT::JWKError
    render_problem(:unauthorized, 'Invalid bearer token')
  rescue KeycloakJwt::Unavailable
    render_problem(:service_unavailable, 'Keycloak is unavailable')
  end

  def find_my_profile
    UserProfile.find_by(keycloak_user_id: current_subject).tap do |profile|
      render_problem(:not_found, 'UNIR user not found') unless profile
    end
  end

  def valid_catalog_relations?(payload, required:, profile: nil)
    course_id = payload.fetch('courseId', profile&.course_id)
    department_id = payload.fetch('departmentId', profile&.department_id)
    return true if catalog_relations_absent?(course_id, department_id, required)
    return false unless catalog_relation_pair?(course_id, department_id)

    course_belongs_to_department?(course_id, department_id)
  end

  def catalog_relations_absent?(course_id, department_id, required)
    course_id.blank? && department_id.blank? && !required
  end

  def catalog_relation_pair?(course_id, department_id)
    course_id.present? && department_id.present?
  end

  def course_belongs_to_department?(course_id, department_id)
    Course.exists?(id: course_id, department_id: department_id, reference_only: false)
  end

  def current_subject
    @token_claims.fetch('sub')
  end

  def render_save_error(profile)
    return render_problem(:conflict, 'User already exists') if profile.errors.of_kind?(:keycloak_user_id, :taken)
    if profile.errors.of_kind?(:registration_code, :taken)
      return render_problem(:conflict, 'Institutional ID already exists')
    end

    render_invalid_profile(profile)
  end

  def render_create_conflict
    detail = if UserProfile.exists?(keycloak_user_id: current_subject)
               'User already exists'
             else
               'Institutional ID already exists'
             end
    render_problem(:conflict, detail)
  end
end
