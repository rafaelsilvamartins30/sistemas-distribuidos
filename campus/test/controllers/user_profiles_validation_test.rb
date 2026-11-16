# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class UserProfilesValidationTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'duplicate subject and institutional id return conflict' do
    create_profile
    with_jwks do
      post '/users',
           params: valid_profile.merge(institutionalId: 'different'),
           headers: bearer_headers,
           as: :json
    end
    assert_response :conflict
    assert_equal 'User already exists', response.parsed_body.fetch('detail')

    with_jwks do
      post '/users', params: valid_profile, headers: bearer_headers(subject: 'another-sub'), as: :json
    end
    assert_response :conflict
    assert_equal 'Institutional ID already exists', response.parsed_body.fetch('detail')
  end

  test 'rejects unknown fields, invalid enum values, blank fields, and invalid interests' do
    invalid_requests = [
      valid_profile.merge(email: 'spoofed@unir.br'),
      valid_profile.merge(affiliationStatus: 'GUEST'),
      valid_profile.merge(academicLevel: 'GRADUATE'),
      valid_profile.merge(name: ' '),
      valid_profile.merge(interests: [''])
    ]

    invalid_requests.each do |payload|
      with_jwks { post '/users', params: payload, headers: bearer_headers, as: :json }
      assert_response :bad_request
    end
    assert_equal 0, UserProfile.count
  end

  test 'rejects changes to identity fields' do
    create_profile
    with_jwks do
      patch '/users/me', params: { institutionalId: '67890' }, headers: bearer_headers, as: :json
    end

    assert_response :bad_request
    assert_equal '12345', UserProfile.sole.registration_code
  end

  test 'stores no email, password, or role data' do
    create_profile
    columns = ActiveRecord::Base.connection.columns(:user_profiles).map(&:name)

    assert_not_includes columns, 'email'
    assert_not_includes columns, 'password'
    assert_not_includes columns, 'roles'
  end
end
