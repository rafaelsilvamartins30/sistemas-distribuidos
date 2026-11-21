# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class ProfessorVerificationRequestsControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'department administrator approval creates an active professor affiliation' do
    create_profile(subject: 'faculty-subject', institutional_id: 'siape-987')
    department = create_department(administrators: ['department-admin'])
    submit_request(subject: 'faculty-subject')

    assert_response :created
    verification = InstitutionalRequest.sole
    assert_equal 'PROFESSOR_VERIFICATION', verification.type
    assert_equal 'PENDING', verification.status
    assert_equal 'siape-987', verification.payload_json.fetch('identifier')
    assert_nil professor_affiliation('faculty-subject')

    list_requests(subject: 'faculty-subject', department_id: department.id)
    assert_response :forbidden
    list_requests(subject: 'department-admin', department_id: department.id)
    assert_response :success
    assert_equal 'Ana Silva', response.parsed_body.fetch('items').sole.fetch('requesterName')

    review_request(subject: 'department-admin', request_id: verification.id, decision: 'approve')
    assert_response :success
    assert_equal 'APPROVED', verification.reload.status
    assert_equal 'department-admin', verification.reviewed_by_user_id
    assert_equal 'ACTIVE', ProfessorAffiliation.sole.status
    assert_equal department.id, ProfessorAffiliation.sole.department_id

    request_contexts(subject: 'faculty-subject')
    assert_response :success
    assert_equal 'PROFESSOR', response.parsed_body.fetch('items').sole.fetch('publisherType')
    assert_equal UserProfile.find_by!(keycloak_user_id: 'faculty-subject').id,
                 response.parsed_body.fetch('items').sole.fetch('publisherId')
  end

  test 'only a department administrator may review and rejection creates no affiliation' do
    create_profile(subject: 'faculty-subject')
    create_department(administrators: ['department-admin'])
    submit_request(subject: 'faculty-subject')
    verification = InstitutionalRequest.sole

    review_request(subject: 'other-user', request_id: verification.id, decision: 'approve')
    assert_response :forbidden
    assert_equal 'PENDING', verification.reload.status
    assert_empty ProfessorAffiliation.all

    review_request(subject: 'department-admin', request_id: verification.id, decision: 'reject')
    assert_response :success
    assert_equal 'REJECTED', verification.reload.status
    assert_empty ProfessorAffiliation.all
  end

  test 'request requires an existing profile and rejects spoofed fields and duplicates' do
    create_department(administrators: [])
    submit_request(subject: 'no-profile')
    assert_response :not_found

    create_profile(subject: 'faculty-subject')
    submit_request(
      subject: 'faculty-subject', extra: { requestedByUserId: 'department-admin' }
    )
    assert_response :bad_request

    submit_request(subject: 'faculty-subject')
    submit_request(subject: 'faculty-subject')
    assert_response :conflict
    assert_equal 1, InstitutionalRequest.count
  end

  test 'context lookup rejects an invalid bearer token' do
    get '/internal/v1/opportunity-publishers', headers: { 'Authorization' => 'Bearer invalid-token' }

    assert_response :unauthorized
  end

  private

  def submit_request(subject:, department_id: nil, extra: {})
    with_jwks do
      post '/professor-verification-requests',
           params: (department_id ? { departmentId: department_id } : {}).merge(extra),
           headers: bearer_headers(subject: subject),
           as: :json
    end
  end

  def list_requests(subject:, department_id:)
    with_jwks do
      get "/departments/#{department_id}/professor-verification-requests",
          headers: bearer_headers(subject: subject)
    end
  end

  def review_request(subject:, request_id:, decision:)
    with_jwks do
      post "/professor-verification-requests/#{request_id}/#{decision}",
           headers: bearer_headers(subject: subject),
           as: :json
    end
  end

  def request_contexts(subject:)
    with_jwks do
      get '/internal/v1/opportunity-publishers', headers: bearer_headers(subject: subject)
    end
  end

  def professor_affiliation(subject)
    UserProfile.find_by!(keycloak_user_id: subject).professor_affiliation
  end

  def create_department(administrators: [])
    department = ensure_profile_department!
    department.update!(administrator_user_ids: administrators)
    department
  end
end
