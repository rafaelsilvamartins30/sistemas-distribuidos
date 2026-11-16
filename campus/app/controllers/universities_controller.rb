# frozen_string_literal: true

# Reads the single university record.
class UniversitiesController < ApplicationController
  before_action :authenticate_keycloak!

  def show
    university = University.current
    return render_problem(:not_found, 'University not found') unless university

    render json: university_response(university)
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

  def university_response(university)
    {
      id: university.id, name: university.name, acronym: university.acronym,
      description: university.description, generalInfoMarkdown: university.general_info_markdown,
      currentTerm: university.current_term, logoUrl: university.logo_url, bannerUrl: university.banner_url,
      links: university.links
    }
  end
end
