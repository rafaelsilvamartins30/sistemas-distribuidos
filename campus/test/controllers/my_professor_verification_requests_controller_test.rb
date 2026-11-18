# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class MyProfessorVerificationRequestsControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'own request history requires an authenticated account' do
    get '/professor-verification-requests/me'

    assert_response :unauthorized
  end

  test 'each requester sees only their own history with department details' do
    create_profile(subject: 'faculty-subject', institutional_id: 'siape-987')
    create_profile(subject: 'another-faculty', institutional_id: 'siape-988')
    department = create_department
    submit_request(subject: 'faculty-subject')
    submit_request(subject: 'another-faculty')

    my_requests(subject: 'faculty-subject')

    assert_response :success
    items = response.parsed_body.fetch('items')
    assert_equal 1, items.length
    assert_equal 'faculty-subject', items.sole.fetch('requestedByUserId')
    assert_equal 'Ana Silva', items.sole.fetch('requesterName')
    assert_equal department.id, items.sole.fetch('targetDepartmentId')
    assert_equal department.name, items.sole.fetch('targetDepartmentName')
    assert_equal 'siape-987', items.sole.fetch('payload').fetch('identifier')
    assert_equal 'PENDING', items.sole.fetch('status')

    my_requests(subject: 'another-faculty')
    assert_response :success
    assert_equal 'another-faculty', response.parsed_body.fetch('items').sole.fetch('requestedByUserId')

    my_requests(subject: 'unknown-user')
    assert_response :success
    assert_empty response.parsed_body.fetch('items')
  end

  private

  def submit_request(subject:)
    with_jwks do
      post '/professor-verification-requests',
           params: {},
           headers: bearer_headers(subject: subject),
           as: :json
    end
    assert_response :created
  end

  def my_requests(subject:)
    with_jwks do
      get '/professor-verification-requests/me', headers: bearer_headers(subject: subject)
    end
  end

  def create_department
    ensure_profile_department!
  end
end
