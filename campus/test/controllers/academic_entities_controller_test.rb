# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class AcademicEntitiesControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'academic entity queries require a valid bearer token' do
    get '/entities'
    assert_response :unauthorized

    get '/entities', headers: { 'Authorization' => 'Bearer not-a-jwt' }
    assert_response :unauthorized
  end

  test 'lists persisted academic entities with the shared paginated list contract' do
    department = create_department
    create_entity(id: '10000000-0000-4000-8000-000000000101', name: 'Centro de Estudos', department: department)
    create_entity(id: '10000000-0000-4000-8000-000000000102', name: 'Núcleo de Pesquisa', department: department)

    with_jwks { get '/entities?page=1&size=1', headers: bearer_headers }

    assert_response :success
    assert_equal 1, response.parsed_body.fetch('page')
    assert_equal 1, response.parsed_body.fetch('size')
    assert_equal 2, response.parsed_body.fetch('totalElements')
    assert_equal 2, response.parsed_body.fetch('totalPages')
    names = response.parsed_body.fetch('items').map { |item| item.fetch('name') }
    assert_equal ['Núcleo de Pesquisa'], names
  end

  test 'returns approved entity fields and optional department relation' do
    department = create_department
    entity = create_entity(
      id: '10000000-0000-4000-8000-000000000103', name: 'Centro de Estudos', department: department
    )

    with_jwks { get "/entities/#{entity.id}", headers: bearer_headers }

    assert_response :success
    assert_equal entity.id, response.parsed_body.fetch('id')
    assert_equal 'Centro de Estudos', response.parsed_body.fetch('name')
    assert_equal 'Representação estudantil', response.parsed_body.fetch('entityType')
    assert_equal department.id, response.parsed_body.fetch('departmentId')
    assert_equal ['https://example.edu.br'], response.parsed_body.fetch('links')
    assert_equal ['keycloak-manager-id'], response.parsed_body.fetch('managerUserIds')

    with_jwks { get '/entities/10000000-0000-4000-8000-000000000199', headers: bearer_headers }
    assert_response :not_found
  end

  test 'rejects invalid pagination and sort parameters' do
    with_jwks do
      get '/entities?page=-1', headers: bearer_headers
      assert_response :bad_request

      get '/entities?size=0', headers: bearer_headers
      assert_response :bad_request

      get '/entities?sort=manager_user_ids', headers: bearer_headers
    end
    assert_response :bad_request
  end

  test 'requires an entity type and array values for list fields' do
    entity = AcademicEntity.new(
      name: 'Entidade', description: 'Descrição', general_info_markdown: 'Informações',
      entity_type: nil, links: 'invalid', manager_user_ids: 'invalid'
    )

    assert_not entity.valid?
    assert_includes entity.errors.attribute_names, :entity_type
    assert_includes entity.errors.attribute_names, :links
    assert_includes entity.errors.attribute_names, :manager_user_ids
  end

  private

  def create_department
    Department.create!(
      id: '10000000-0000-4000-8000-000000000001', name: 'Departamento de Demonstração', acronym: 'DEMO',
      description: 'Departamento de teste.', general_info_markdown: 'Informações.', links: [],
      administrator_user_ids: []
    )
  end

  def create_entity(id:, name:, department:)
    AcademicEntity.create!(
      id: id, name: name, description: 'Descrição da entidade.', general_info_markdown: 'Informações gerais.',
      entity_type: 'Representação estudantil', department: department, links: ['https://example.edu.br'],
      manager_user_ids: ['keycloak-manager-id']
    )
  end
end
