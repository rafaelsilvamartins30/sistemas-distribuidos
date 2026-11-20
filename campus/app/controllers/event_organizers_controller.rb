# frozen_string_literal: true

# Resolves the authenticated subject's current event organizing contexts.
class EventOrganizersController < ApplicationController
  include KeycloakAuthenticated

  def index
    render json: { items: organizer_contexts_for(current_subject) }
  end

  private

  def organizer_contexts_for(subject)
    university_contexts(subject) +
      academic_unit_contexts(subject) +
      department_contexts(subject) +
      entity_contexts(subject) +
      community_contexts(subject) +
      professor_context(subject)
  end

  def university_contexts(subject)
    university = University.current
    return [] unless university && administered_by?(university, subject)

    [organizer_context('UNIVERSITY', university.id, university.name)]
  end

  def academic_unit_contexts(subject)
    return [] unless defined?(AcademicUnit) && AcademicUnit.table_exists?

    AcademicUnit.order(:name).filter_map do |unit|
      next unless administered_by?(unit, subject)

      organizer_context('ACADEMIC_UNIT', unit.id, unit.name)
    end
  end

  def department_contexts(subject)
    Department.order(:name).filter_map do |department|
      next unless department.administered_by?(subject)

      organizer_context('DEPARTMENT', department.id, department.name)
    end
  end

  def entity_contexts(subject)
    AcademicEntity.order(:name).filter_map do |entity|
      next unless administered_by?(entity, subject)

      organizer_context('ACADEMIC_ENTITY', entity.id, entity.name)
    end
  end

  def community_contexts(subject)
    Community.order(:name).filter_map do |community|
      next unless administered_by?(community, subject)

      organizer_context('COMMUNITY', community.id, community.name)
    end
  end

  def professor_context(subject)
    profile = UserProfile.find_by(keycloak_user_id: subject)
    return [] unless profile&.professor_affiliation&.status == 'ACTIVE'

    [organizer_context('PROFESSOR', profile.id, profile.name)]
  end

  def administered_by?(record, subject)
    ids =
      if record.respond_to?(:administrator_user_ids)
        record.administrator_user_ids
      elsif record.respond_to?(:manager_user_ids)
        record.manager_user_ids
      else
        []
      end
    Array(ids).include?(subject)
  end

  def organizer_context(organizer_type, organizer_id, name)
    { organizerType: organizer_type, organizerId: organizer_id, name: name }
  end
end
