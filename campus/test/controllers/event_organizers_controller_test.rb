# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class EventOrganizersControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'returns department, academic entity, community, and active professor organizer contexts' do
    organizers = create_event_organizers
    request_event_organizers

    assert_response :success
    assert_event_organizer_contexts(organizers)
  end

  private

  def create_event_organizers
    department = create_organizer_department
    entity = create_organizer_entity(department)
    community = create_organizer_community
    profile = create_organizer_professor(department)
    [department.id, entity.id, community.id, profile.id]
  end

  def create_organizer_department
    ensure_profile_department!.tap do |department|
      department.update!(administrator_user_ids: [KeycloakJwtTestHelpers::SUBJECT])
    end
  end

  def create_organizer_entity(department)
    AcademicEntity.create!(name: 'Centro Acadêmico de Computação', description: 'Representação estudantil.',
                           general_info_markdown: 'Informações do CA.', entity_type: 'ACADEMIC_CENTER',
                           department: department, links: [],
                           administrator_user_ids: [KeycloakJwtTestHelpers::SUBJECT])
  end

  def create_organizer_community
    Community.create!(name: 'Comunidade de Jogos e Cultura', description: 'Encontros semanais.',
                      general_info_markdown: 'Informações da comunidade.', links: [],
                      administrator_user_ids: [KeycloakJwtTestHelpers::SUBJECT])
  end

  def create_organizer_professor(department)
    create_profile(subject: KeycloakJwtTestHelpers::SUBJECT)
    profile = UserProfile.find_by!(keycloak_user_id: KeycloakJwtTestHelpers::SUBJECT)
    ProfessorAffiliation.create!(user_id: profile.id, department_id: department.id, status: 'ACTIVE')
    profile
  end

  def request_event_organizers
    with_jwks { get '/internal/v1/event-organizers', headers: bearer_headers }
  end

  def assert_event_organizer_contexts(organizer_ids)
    contexts = response.parsed_body.fetch('items')
    assert_equal(%w[DEPARTMENT ACADEMIC_ENTITY COMMUNITY PROFESSOR],
                 contexts.map { |item| item.fetch('organizerType') })
    assert_equal(organizer_ids, contexts.map { |item| item.fetch('organizerId') })
  end
end
