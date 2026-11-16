# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class CommunitiesControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'community queries require a valid bearer token' do
    get '/communities'
    assert_response :unauthorized

    get '/communities', headers: { 'Authorization' => 'Bearer not-a-jwt' }
    assert_response :unauthorized
  end

  test 'lists persisted communities with the shared paginated list contract' do
    create_community(id: '10000000-0000-4000-8000-000000000201', name: 'Clube de Jogos')
    create_community(id: '10000000-0000-4000-8000-000000000202', name: 'Grupo de Pesquisa')

    with_jwks { get '/communities?page=1&size=1', headers: bearer_headers }

    assert_response :success
    assert_equal 1, response.parsed_body.fetch('page')
    assert_equal 1, response.parsed_body.fetch('size')
    assert_equal 2, response.parsed_body.fetch('totalElements')
    assert_equal 2, response.parsed_body.fetch('totalPages')
    names = response.parsed_body.fetch('items').map { |item| item.fetch('name') }
    assert_equal ['Grupo de Pesquisa'], names
  end

  test 'returns approved community fields and 404 for unknown IDs' do
    community = create_community(id: '10000000-0000-4000-8000-000000000203', name: 'Clube de Jogos')

    with_jwks { get "/communities/#{community.id}", headers: bearer_headers }

    assert_response :success
    assert_equal community.id, response.parsed_body.fetch('id')
    assert_equal 'Clube de Jogos', response.parsed_body.fetch('name')
    assert_equal 'Jogos', response.parsed_body.fetch('category')
    assert_equal ['https://example.edu.br'], response.parsed_body.fetch('links')
    assert_equal ['keycloak-manager-id'], response.parsed_body.fetch('managerUserIds')

    with_jwks { get '/communities/10000000-0000-4000-8000-000000000299', headers: bearer_headers }
    assert_response :not_found
  end

  test 'rejects invalid pagination and sort parameters' do
    with_jwks do
      get '/communities?page=-1', headers: bearer_headers
      assert_response :bad_request

      get '/communities?size=0', headers: bearer_headers
      assert_response :bad_request

      get '/communities?sort=manager_user_ids', headers: bearer_headers
    end
    assert_response :bad_request
  end

  private

  def create_community(id:, name:)
    Community.create!(
      id: id, name: name, description: 'Descrição da comunidade.', general_info_markdown: 'Informações gerais.',
      category: 'Jogos', links: ['https://example.edu.br'], manager_user_ids: ['keycloak-manager-id']
    )
  end
end
