# frozen_string_literal: true

# Verifies the original user token before Campus evaluates contextual relationships.
module KeycloakAuthenticated
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_keycloak!
  end

  private

  def authenticate_keycloak!
    match = request.authorization.to_s.match(/\ABearer\s+(\S+)\z/i)
    return render_problem(:unauthorized, 'Bearer token is required') unless match

    @token_claims = KeycloakJwt.decode(match[1])
    return if @token_claims['sub'].present?

    render_problem(:unauthorized, 'Bearer token subject is required')
  rescue JWT::DecodeError, JWT::JWKError
    render_problem(:unauthorized, 'Invalid bearer token')
  rescue KeycloakJwt::Unavailable
    render_problem(:service_unavailable, 'Keycloak is unavailable')
  end

  def current_subject
    @token_claims.fetch('sub')
  end

  # Identity labels come from the verified Keycloak token, never from request payloads.
  def current_display_name
    @token_claims['name'].presence || @token_claims['preferred_username'].presence || @token_claims['email'].presence
  end

  def platform_admin_role?
    roles = @token_claims.dig('realm_access', 'roles')
    roles.is_a?(Array) && roles.include?('PLATFORM_ADMIN')
  end

  def global_platform_admin?
    return false unless platform_admin_role?

    global_id = global_administrator_subject
    return global_id == current_subject if global_id.present?

    University.current&.administrator_user_ids&.include?(current_subject) == true
  end

  def global_administrator_subject
    UserProfile.find_by(registration_code: ProtectGlobalAdministrator::GLOBAL_ADMIN_REGISTRATION_CODE)&.keycloak_user_id
  end
end
