# frozen_string_literal: true

# Reads and edits the single university institutional profile.
class UniversitiesController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization
  include InstitutionalProfileSerialization

  wrap_parameters false

  def show
    university = University.current
    return render_problem(:not_found, 'University not found') unless university

    render json: university_response(university)
  end

  def update
    university = University.current
    return render_problem(:not_found, 'University not found') unless university

    payload = profile_payload(%w[name acronym description generalInfoMarkdown logoUrl bannerUrl links administratorUserIds currentTerm])
    return unless payload
    return unless require_profile_update_permissions(university, payload)

    assign_profile_fields(university, payload.except('acronym', 'currentTerm'))
    university.acronym = payload['acronym'] if payload.key?('acronym')
    university.current_term = payload['currentTerm'] if payload.key?('currentTerm')
    return render(json: university_response(university)) if university.save

    render_problem(:unprocessable_entity, "Invalid fields: #{university.errors.attribute_names.uniq.sort.join(', ')}")
  end

  private

  def university_response(university)
    institutional_profile_fields(university).merge(acronym: university.acronym, currentTerm: university.current_term)
  end
end
