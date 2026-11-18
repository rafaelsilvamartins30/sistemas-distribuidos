# frozen_string_literal: true

# Profile endpoints implementing the existing public HTTP contract.
class UsersController < ApplicationController
  include UserProfiles::ApiContract

  wrap_parameters false

  before_action :authenticate_keycloak!

  def create
    payload = load_payload(CREATE_FIELDS)
    return unless payload
    unless valid_department_catalog?(payload, required: true)
      return render_problem(:bad_request, 'department must match an existing Campus department')
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
    unless valid_department_catalog?(payload, required: false)
      return render_problem(:bad_request, 'department must match an existing Campus department')
    end

    profile = find_my_profile
    return unless profile

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

  def valid_department_catalog?(payload, required:)
    return true unless required || payload.key?('department')

    Department.exists?(name: payload['department'])
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
