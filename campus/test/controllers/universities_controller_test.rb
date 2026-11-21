# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class UniversitiesControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'university query requires a valid bearer token' do
    get '/university'
    assert_response :unauthorized

    get '/university', headers: { 'Authorization' => 'Bearer not-a-jwt' }
    assert_response :unauthorized
  end

  test 'returns the persisted singleton university fields' do
    university = University.create!(
      name: 'Universidade Federal do Rio de Janeiro',
      acronym: 'UFRJ',
      description: 'Universidade Federal do Rio de Janeiro.',
      general_info_markdown: 'Informações gerais da UFRJ.',
      current_term: '2026.2',
      links: []
    )

    with_jwks { get '/university', headers: bearer_headers }

    assert_response :success
    assert_equal university.id, response.parsed_body.fetch('id')
    assert_equal 'UFRJ', response.parsed_body.fetch('acronym')
    assert_equal '2026.2', response.parsed_body.fetch('currentTerm')
    assert_equal [], response.parsed_body.fetch('links')
  end

  test 'returns not found until the singleton university has been seeded' do
    with_jwks { get '/university', headers: bearer_headers }

    assert_response :not_found
    assert_equal 'application/problem+json', response.media_type
  end
end
