# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class UserProfileCatalogTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'profile course must belong to the selected department' do
    catalog = ensure_profile_catalog!
    other_department = Department.create!(
      id: '20000000-0000-4000-8000-000000000004', name: 'Outro Departamento', acronym: 'OUT',
      description: 'Outro departamento.', general_info_markdown: 'Informações.', links: [],
      administrator_user_ids: []
    )
    invalid_profile = valid_profile.merge(departmentId: other_department.id)

    with_jwks { post '/users', params: invalid_profile, headers: bearer_headers, as: :json }

    assert_response :bad_request
    assert_equal 'Course must belong to the selected department', response.parsed_body.fetch('detail')
    assert_empty UserProfile.all

    create_profile
    with_jwks do
      patch '/users/me', params: { departmentId: 'missing-department' }, headers: bearer_headers, as: :json
    end
    assert_response :bad_request
    assert_equal catalog.fetch(:department).id, UserProfile.sole.department_id
  end

  test 'profile requires existing department and department-owned course' do
    ensure_profile_catalog!
    with_jwks do
      post '/users', params: valid_profile.merge(departmentId: nil), headers: bearer_headers, as: :json
    end
    assert_response :bad_request
    assert_empty UserProfile.all

    with_jwks do
      post '/users', params: valid_profile.merge(courseId: 'missing-course'), headers: bearer_headers, as: :json
    end
    assert_response :bad_request
    assert_empty UserProfile.all
  end
end
