# frozen_string_literal: true

# Resolves the authenticated subject's current opportunity publishing contexts.
class OpportunityPublishersController < ApplicationController
  include KeycloakAuthenticated

  def index
    render json: { items: publisher_contexts_for(current_subject) }
  end

  private

  def publisher_contexts_for(subject)
    department_contexts(subject) + entity_contexts(subject) + professor_context(subject)
  end

  def department_contexts(subject)
    Department.order(:name).filter_map do |department|
      next unless global_platform_admin? || department.administered_by?(subject)

      publisher_context('DEPARTMENT', department.id, department.name)
    end
  end

  def entity_contexts(subject)
    AcademicEntity.order(:name).filter_map do |entity|
      next unless global_platform_admin? || entity.administrator_user_ids.include?(subject)

      publisher_context('ACADEMIC_ENTITY', entity.id, entity.name)
    end
  end

  def professor_context(subject)
    profile = UserProfile.find_by(keycloak_user_id: subject)
    return [] unless profile&.professor_affiliation&.status == 'ACTIVE'

    [publisher_context('PROFESSOR', profile.id, profile.name)]
  end

  def publisher_context(publisher_type, publisher_id, name)
    { publisherType: publisher_type, publisherId: publisher_id, name: name }
  end
end
