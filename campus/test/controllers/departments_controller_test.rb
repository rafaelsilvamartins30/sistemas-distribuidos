# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class DepartmentsControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'department queries require a valid bearer token' do
    get '/departments'
    assert_response :unauthorized

    get '/departments', headers: { 'Authorization' => 'Bearer not-a-jwt' }
    assert_response :unauthorized
  end

  test 'lists persisted departments with the shared paginated list contract' do
    create_department(id: '10000000-0000-4000-8000-000000000001', acronym: 'DCC')
    create_department(id: '10000000-0000-4000-8000-000000000002', acronym: 'DEL')

    with_jwks { get '/departments?page=1&size=1', headers: bearer_headers }

    assert_response :success
    assert_equal 1, response.parsed_body.fetch('page')
    assert_equal 1, response.parsed_body.fetch('size')
    assert_equal 2, response.parsed_body.fetch('totalElements')
    assert_equal 2, response.parsed_body.fetch('totalPages')
    acronyms = response.parsed_body.fetch('items').map { |item| item.fetch('acronym') }
    assert_equal ['DEL'], acronyms
  end

  test 'supports approved department detail fields and returns 404 for unknown IDs' do
    department = create_department(id: '10000000-0000-4000-8000-000000000003', acronym: 'DCC')

    with_jwks { get "/departments/#{department.id}", headers: bearer_headers }

    assert_response :success
    assert_equal department.id, response.parsed_body.fetch('id')
    assert_equal 'DCC', response.parsed_body.fetch('acronym')
    assert_equal ['https://dcc.example.edu.br'], response.parsed_body.fetch('links')
    assert_nil response.parsed_body.fetch('administratorUserIds')
    assert_equal [], response.parsed_body.fetch('courses')

    with_jwks { get "/departments/#{department.id}", headers: bearer_headers(subject: 'keycloak-admin-id') }
    assert_response :success
    assert_equal ['keycloak-admin-id'], response.parsed_body.fetch('administratorUserIds')

    with_jwks { get '/departments/10000000-0000-4000-8000-000000000099', headers: bearer_headers }
    assert_response :not_found
  end

  test 'rejects invalid pagination and sort parameters' do
    with_jwks do
      get '/departments?page=-1', headers: bearer_headers
      assert_response :bad_request

      get '/departments?size=0', headers: bearer_headers
      assert_response :bad_request

      get '/departments?sort=administrator_user_ids', headers: bearer_headers
    end
    assert_response :bad_request
  end

  test 'a global platform role does not replace the department or university administrator list' do
    create_university(administrators: ['university-admin'])
    department = create_department(id: '10000000-0000-4000-8000-000000000010', acronym: 'DCC')

    with_jwks do
      headers = bearer_headers(subject: 'platform-only', roles: ['PLATFORM_ADMIN'])
      patch "/departments/#{department.id}", params: { name: 'Nome alterado' },
                                             headers: headers, as: :json
    end
    assert_response :forbidden
    assert_equal 'Departamento de Ciência da Computação', department.reload.name

    with_jwks do
      headers = bearer_headers(subject: 'platform-only', roles: ['PLATFORM_ADMIN'])
      post '/departments', params: {
        name: 'Departamento novo', acronym: 'DN', description: 'Descrição.', generalInfoMarkdown: 'Info.'
      }, headers: headers, as: :json
    end
    assert_response :forbidden
  end

  test 'keeps the global administrator in contextual administrator lists' do
    create_profile(subject: 'global-admin-sub', institutional_id: 'ADMIN-0001')
    department = create_department(id: '10000000-0000-4000-8000-000000000011', acronym: 'DCC')

    with_jwks do
      patch "/departments/#{department.id}", params: { administratorUserIds: ['keycloak-admin-id'] },
                                             headers: bearer_headers(subject: 'keycloak-admin-id'), as: :json
    end
    assert_response :success
    assert_equal %w[keycloak-admin-id global-admin-sub], department.reload.administrator_user_ids
    assert_equal %w[keycloak-admin-id global-admin-sub], response.parsed_body.fetch('administratorUserIds')
  end

  test 'the global administrator can manage older profiles and cannot be removed from their administrator list' do
    department = create_department(id: '10000000-0000-4000-8000-000000000012', acronym: 'LEG', administrators: [])
    create_profile(subject: 'global-admin-sub', institutional_id: 'ADMIN-0001')
    headers = bearer_headers(subject: 'global-admin-sub', roles: ['PLATFORM_ADMIN'])

    with_jwks { get "/departments/#{department.id}", headers: headers }
    assert_response :success
    assert_equal true, response.parsed_body.fetch('viewerCanManage')
    assert_equal ['global-admin-sub'], response.parsed_body.fetch('administratorUserIds')

    with_jwks do
      patch "/departments/#{department.id}", params: { administratorUserIds: [] }, headers: headers, as: :json
    end
    assert_response :success
    assert_equal ['global-admin-sub'], department.reload.administrator_user_ids
  end

  private

  def create_department(id:, acronym:, administrators: ['keycloak-admin-id'])
    name = acronym == 'DCC' ? 'Departamento de Ciência da Computação' : 'Departamento de Engenharia Elétrica'
    Department.create!(id: id, acronym: acronym, name: name, description: "Departamento #{acronym}.",
                       general_info_markdown: "Informações gerais de #{acronym}.",
                       links: ['https://dcc.example.edu.br'], administrator_user_ids: administrators)
  end

  def create_university(administrators:)
    University.create!(id: University::SINGLETON_ID, name: 'Universidade de Teste', acronym: 'UT',
                       description: 'Descrição.', general_info_markdown: 'Informações.',
                       current_term: '2026/2', links: [], administrator_user_ids: administrators)
  end
end
