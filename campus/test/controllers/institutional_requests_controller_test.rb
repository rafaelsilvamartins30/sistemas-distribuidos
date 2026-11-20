# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class InstitutionalRequestsControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'department administrator approves a community request and requester becomes its administrator' do
    department = create_department(administrators: ['department-admin'])
    request_body = profile_request('COMMUNITY_CREATION', department.id)

    with_jwks do
      post '/requests', params: request_body, headers: bearer_headers(subject: 'community-requester'), as: :json
    end

    assert_response :created
    request_id = response.parsed_body.fetch('id')
    assert_equal 'DEPARTMENT', response.parsed_body.fetch('targetType')
    assert Notification.exists?(recipient_user_id: 'department-admin', resource_id: request_id)

    with_jwks do
      get '/requests/pending', headers: bearer_headers(subject: 'department-admin')
    end
    assert_response :success
    assert_equal [request_id], response.parsed_body.fetch('items').map { |item| item.fetch('id') }

    with_jwks do
      post "/requests/#{request_id}/approve", headers: bearer_headers(subject: 'not-an-admin')
    end
    assert_response :forbidden
    assert_equal 0, Community.count

    with_jwks do
      post "/requests/#{request_id}/approve", headers: bearer_headers(subject: 'department-admin')
    end
    assert_response :success
    community = Community.sole
    assert_equal department.id, community.department_id
    assert_equal ['community-requester'], community.administrator_user_ids
    assert_equal community.id, response.parsed_body.dig('createdProfile', 'id')
    assert_equal InstitutionalRequest::APPROVED, InstitutionalRequest.find(request_id).status
    assert Notification.exists?(recipient_user_id: 'community-requester', resource_id: request_id,
                                event_type: 'REQUEST_DECIDED')
  end

  test 'university administrator can approve a university-level entity request' do
    create_university(administrators: ['university-admin'])
    body = profile_request('ENTITY_CREATION', nil).tap do |request|
      request[:payload][:entityType] = 'PESQUISA'
      request[:payload].delete(:category)
    end

    with_jwks do
      post '/requests', params: body, headers: bearer_headers(subject: 'entity-requester'), as: :json
    end
    assert_response :created
    request_id = response.parsed_body.fetch('id')
    assert_equal 'UNIVERSITY', response.parsed_body.fetch('targetType')

    with_jwks do
      post "/requests/#{request_id}/approve", headers: bearer_headers(subject: 'university-admin')
    end
    assert_response :success
    entity = AcademicEntity.sole
    assert_nil entity.department_id
    assert_equal ['entity-requester'], entity.administrator_user_ids
  end

  test 'creation requests reject client-selected administrators and unauthorized review is scoped' do
    department = create_department(administrators: ['department-admin'])
    body = profile_request('COMMUNITY_CREATION', department.id)
    body[:payload][:administratorUserIds] = ['attacker']

    with_jwks do
      post '/requests', params: body, headers: bearer_headers(subject: 'requester'), as: :json
    end
    assert_response :bad_request
    assert_empty InstitutionalRequest.all

    body = profile_request('COMMUNITY_CREATION', department.id)
    with_jwks do
      post '/requests', params: body, headers: bearer_headers(subject: 'requester'), as: :json
    end
    request_id = response.parsed_body.fetch('id')
    with_jwks do
      get '/requests/pending', headers: bearer_headers(subject: 'other-admin')
    end
    assert_response :success
    assert_empty response.parsed_body.fetch('items')
    with_jwks do
      post "/requests/#{request_id}/reject", headers: bearer_headers(subject: 'other-admin')
    end
    assert_response :forbidden
    assert_equal InstitutionalRequest::PENDING, InstitutionalRequest.find(request_id).status
  end

  test 'department request approval activates a professor affiliation from the profile department' do
    department = ensure_profile_department!
    department.update!(administrator_user_ids: ['department-admin'])
    create_profile(subject: 'professor-requester')

    with_jwks do
      post '/professor-verification-requests', params: {},
           headers: bearer_headers(subject: 'professor-requester'), as: :json
    end
    assert_response :created
    request_id = response.parsed_body.fetch('id')

    with_jwks do
      post "/requests/#{request_id}/approve", headers: bearer_headers(subject: 'department-admin')
    end
    assert_response :success
    affiliation = ProfessorAffiliation.find_by!(user_id: UserProfile.find_by!(keycloak_user_id: 'professor-requester').id)
    assert_equal 'ACTIVE', affiliation.status
    assert_equal department.id, affiliation.department_id
  end

  private

  def profile_request(type, department_id)
    payload = {
      name: 'Comunidade de Demonstração', description: 'Uma descrição de teste.',
      generalInfoMarkdown: '# Informações', links: ['https://example.edu.br'], category: 'CULTURA'
    }
    { type: type, targetDepartmentId: department_id, payload: payload }
  end

  def create_department(administrators: [])
    Department.create!(id: SecureRandom.uuid, name: 'Departamento de Teste', acronym: 'DT',
                       description: 'Descrição.', general_info_markdown: 'Informações.', links: [],
                       administrator_user_ids: administrators)
  end

  def create_university(administrators: [])
    University.create!(id: University::SINGLETON_ID, name: 'Universidade de Teste', acronym: 'UT',
                       description: 'Descrição.', general_info_markdown: 'Informações.', current_term: '2026/2',
                       links: [], administrator_user_ids: administrators)
  end
end
