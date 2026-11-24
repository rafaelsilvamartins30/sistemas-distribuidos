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

  test 'only the global administrator can edit the university and cannot assign contextual administrators' do
    create_profile(subject: 'global-admin-sub', institutional_id: 'ADMIN-0001')
    university = create_test_university(administrators: ['university-admin'])

    assert_university_organizer_access
    assert_university_edit_restrictions(university)
    assert_university_global_admin_update(university)
  end

  private

  def create_test_university(administrators:)
    University.create!(
      id: University::SINGLETON_ID, name: 'Universidade de Teste', acronym: 'UT',
      description: 'Descrição.', general_info_markdown: 'Informações.',
      current_term: '2026/2', links: [], administrator_user_ids: administrators
    )
  end

  def assert_university_organizer_access
    assert_not_includes organizer_types(bearer_headers(subject: 'university-admin')), 'UNIVERSITY'
    assert_includes organizer_types(global_admin_headers), 'UNIVERSITY'
  end

  def organizer_types(headers)
    with_jwks { get '/internal/v1/event-organizers', headers: headers }
    assert_response :success
    response.parsed_body.fetch('items').pluck('organizerType')
  end

  def assert_university_edit_restrictions(university)
    patch_university({ name: 'Nome alterado' }, bearer_headers(subject: 'university-admin'))
    assert_response :forbidden
    patch_university({ name: 'Nome alterado' }, bearer_headers(subject: 'platform-only', roles: ['PLATFORM_ADMIN']))
    assert_response :forbidden
    assert_equal 'Universidade de Teste', university.reload.name
  end

  def assert_university_global_admin_update(university)
    patch_university({ administratorUserIds: ['another-admin'] }, global_admin_headers)
    assert_response :bad_request
    assert_equal %w[university-admin global-admin-sub], university.reload.administrator_user_ids

    patch_university({ name: 'Universidade Atualizada' }, global_admin_headers)
    assert_response :success
    assert_equal 'Universidade Atualizada', university.reload.name
  end

  def patch_university(params, headers)
    with_jwks { patch '/university', params: params, headers: headers, as: :json }
  end

  def global_admin_headers
    bearer_headers(subject: 'global-admin-sub', roles: ['PLATFORM_ADMIN'])
  end
end
