# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class EventOrganizersControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'returns department, academic entity, community, and active professor organizer contexts' do
    department = ensure_profile_department!
    department.update!(administrator_user_ids: [KeycloakJwtTestHelpers::SUBJECT])
    entity = AcademicEntity.create!(
      name: 'Centro Acadêmico de Computação',
      description: 'Representação estudantil.',
      general_info_markdown: 'Informações do CA.',
      entity_type: 'ACADEMIC_CENTER',
      department: department,
      links: [],
      administrator_user_ids: [KeycloakJwtTestHelpers::SUBJECT]
    )
    community = Community.create!(
      name: 'Comunidade de Jogos e Cultura',
      description: 'Encontros semanais.',
      general_info_markdown: 'Informações da comunidade.',
      links: [],
      administrator_user_ids: [KeycloakJwtTestHelpers::SUBJECT]
    )
    create_profile(subject: KeycloakJwtTestHelpers::SUBJECT)
    profile = UserProfile.find_by!(keycloak_user_id: KeycloakJwtTestHelpers::SUBJECT)
    ProfessorAffiliation.create!(user_id: profile.id, department_id: department.id, status: 'ACTIVE')

    with_jwks { get '/internal/v1/event-organizers', headers: bearer_headers }

    assert_response :success
    contexts = response.parsed_body.fetch('items')
    assert_equal %w[DEPARTMENT ACADEMIC_ENTITY COMMUNITY PROFESSOR],
                 contexts.map { |item| item.fetch('organizerType') }
    assert_equal [department.id, entity.id, community.id, profile.id],
                 contexts.map { |item| item.fetch('organizerId') }
  end
end
