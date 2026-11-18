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
end
