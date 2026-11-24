# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'
require_relative '../support/institutional_requests_test_support'

class InstitutionalRequestsControllerTest < ActionDispatch::IntegrationTest
  include InstitutionalRequestsTestSupport

  test 'department administrator approves a community request and requester becomes its administrator' do
    department = create_department(administrators: ['department-admin'])
    request_id = submit_community_request(department, subject: 'community-requester')
    assert_equal 'DEPARTMENT', response.parsed_body.fetch('targetType')
    assert Notification.exists?(recipient_user_id: 'department-admin', resource_id: request_id)
    assert_request_is_pending(request_id, 'department-admin')

    review_request(request_id, 'approve', subject: 'not-an-admin')
    assert_response :forbidden
    assert_equal 0, Community.count

    review_request(request_id, 'approve', subject: 'department-admin')
    assert_response :success
    assert_community_request_approved(request_id, department)
  end

  test 'university administrator can approve a university-level entity request' do
    create_university(administrators: ['university-admin'])
    create_profile(subject: 'global-admin', institutional_id: 'ADMIN-0001')
    body = profile_request('ENTITY_CREATION', nil).tap do |request|
      request[:payload][:entityType] = 'PESQUISA'
      request[:payload].delete(:category)
    end
    submit_institutional_request(body, subject: 'entity-requester')

    assert_response :created
    request_id = response.parsed_body.fetch('id')
    assert_equal 'UNIVERSITY', response.parsed_body.fetch('targetType')
    review_request(request_id, 'approve', subject: 'university-admin')
    assert_response :forbidden

    review_request(request_id, 'approve', subject: 'global-admin', roles: ['PLATFORM_ADMIN'])
    assert_response :success
    entity = AcademicEntity.sole
    assert_nil entity.department_id
    assert_equal %w[entity-requester global-admin], entity.administrator_user_ids
  end

  test 'creation requests reject client-selected administrators and unauthorized review is scoped' do
    department = create_department(administrators: ['department-admin'])
    body = profile_request('COMMUNITY_CREATION', department.id)
    body[:payload][:administratorUserIds] = ['attacker']
    submit_institutional_request(body, subject: 'requester')
    assert_response :bad_request
    assert_empty InstitutionalRequest.all

    request_id = submit_community_request(department, subject: 'requester')
    request_pending(subject: 'other-admin')
    assert_response :success
    assert_empty response.parsed_body.fetch('items')
    review_request(request_id, 'reject', subject: 'other-admin')
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

    review_request(request_id, 'approve', subject: 'department-admin')
    assert_response :success
    affiliation = ProfessorAffiliation.find_by!(user_id: professor_profile.id)
    assert_equal 'ACTIVE', affiliation.status
    assert_equal department.id, affiliation.department_id
  end

  private

  def professor_profile
    UserProfile.find_by!(keycloak_user_id: 'professor-requester')
  end
end
