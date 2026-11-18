# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class ProfessorVerificationRequestDepartmentTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'request department comes from the saved profile and cannot be overridden' do
    create_profile(subject: 'faculty-subject')
    profile_department = ensure_profile_department!
    other_department = Department.create!(
      name: 'Departamento de Engenharia Elétrica',
      acronym: 'DEL',
      description: 'Departamento de teste.',
      general_info_markdown: 'Informações de teste.',
      links: [],
      administrator_user_ids: []
    )

    submit_request(subject: 'faculty-subject', department_id: other_department.id)

    assert_response :bad_request
    assert_empty InstitutionalRequest.all

    submit_request(subject: 'faculty-subject')

    assert_response :created
    assert_equal profile_department.id, InstitutionalRequest.sole.target_department_id
  end

  private

  def submit_request(subject:, department_id: nil)
    with_jwks do
      post '/professor-verification-requests',
           params: department_id ? { departmentId: department_id } : {},
           headers: bearer_headers(subject: subject),
           as: :json
    end
  end
end
