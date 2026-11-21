# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class OpportunityPublishersControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'only active department-reviewed faculty affiliation grants a professor publishing context' do
    create_profile(subject: 'faculty-subject')
    department = create_department(administrators: [])

    request_contexts('faculty-subject')
    assert_empty response.parsed_body.fetch('items')
    profile = UserProfile.find_by!(keycloak_user_id: 'faculty-subject')
    profile.update!(user_type: 'PROFESSOR')
    request_contexts('faculty-subject')
    assert_empty response.parsed_body.fetch('items')

    ProfessorAffiliation.create!(user_id: profile.id, department_id: department.id, status: 'ON_LEAVE')
    request_contexts('faculty-subject')
    assert_empty response.parsed_body.fetch('items')

    profile.professor_affiliation.update!(status: 'ACTIVE')
    request_contexts('faculty-subject')
    assert_response :success
    assert_equal [{ 'publisherType' => 'PROFESSOR', 'publisherId' => profile.id, 'name' => profile.name }],
                 response.parsed_body.fetch('items')
  end

  test 'returns department and academic entity contexts only for their registered administrators' do
    department = create_department(administrators: [KeycloakJwtTestHelpers::SUBJECT])
    entity = AcademicEntity.create!(
      name: 'Laboratório de Sistemas',
      description: 'Pesquisa em sistemas.',
      general_info_markdown: 'Informações do laboratório.',
      entity_type: 'RESEARCH_LAB',
      department: department,
      links: [],
      administrator_user_ids: [KeycloakJwtTestHelpers::SUBJECT]
    )

    with_jwks { get '/internal/v1/opportunity-publishers', headers: bearer_headers }

    assert_response :success
    contexts = response.parsed_body.fetch('items')
    publisher_types = contexts.map { |item| item.fetch('publisherType') }
    publisher_ids = contexts.map { |item| item.fetch('publisherId') }
    assert_equal %w[DEPARTMENT ACADEMIC_ENTITY], publisher_types
    assert_equal [department.id, entity.id], publisher_ids
  end

  private

  def request_contexts(subject)
    with_jwks do
      get '/internal/v1/opportunity-publishers', headers: bearer_headers(subject: subject)
    end
    assert_response :success
  end

  def create_department(administrators: [])
    department = ensure_profile_department!
    department.update!(administrator_user_ids: administrators)
    department
  end
end
