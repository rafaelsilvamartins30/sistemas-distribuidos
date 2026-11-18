# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class UsersControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'profile endpoints require a valid bearer token with a subject' do
    get '/users/me'
    assert_response :unauthorized

    get '/users/me', headers: { 'Authorization' => 'Bearer not-a-jwt' }
    assert_response :unauthorized

    with_jwks { get '/users/me', headers: bearer_headers(subject: nil) }
    assert_response :unauthorized
  end

  test 'rejects expired tokens and tokens from another issuer' do
    with_jwks do
      get '/users/me', headers: bearer_headers(expires_at: 1.minute.ago)
      assert_response :unauthorized

      get '/users/me', headers: bearer_headers(issuer: 'https://other.example/realms/unir')
      assert_response :unauthorized
    end
  end

  test 'creates the profile with the Keycloak subject and the existing creation contract' do
    ensure_profile_department!
    with_jwks { post '/users', params: valid_profile, headers: bearer_headers, as: :json }

    assert_response :created
    assert_equal SUBJECT, response.parsed_body.fetch('id')
    assert_equal '12345', response.parsed_body.fetch('institutionalId')
    assert_equal 'STUDENT', response.parsed_body.fetch('affiliationStatus')
    assert_equal 'UNDERGRADUATE', response.parsed_body.fetch('academicLevel')
    assert_equal ['Sistemas distribuídos'], response.parsed_body.fetch('interests')
    assert_not response.parsed_body.key?('email')
    profile = UserProfile.sole
    assert_equal SUBJECT, profile.keycloak_user_id
    assert_equal '12345', profile.registration_code
    assert_equal 'STUDENT', profile.user_type
    assert_equal 'UNDERGRAD', profile.academic_level
  end

  test 'get me looks up the subject and returns email claims from the current token' do
    create_profile
    with_jwks { get '/users/me', headers: bearer_headers(email: 'current@unir.br') }

    assert_response :success
    assert_equal SUBJECT, response.parsed_body.fetch('id')
    assert_equal 'current@unir.br', response.parsed_body.fetch('email')
    assert_equal true, response.parsed_body.fetch('emailVerified')
    assert_equal '12345', response.parsed_body.fetch('institutionalId')
  end

  test 'get and patch return not found until a profile is created' do
    with_jwks do
      get '/users/me', headers: bearer_headers
      assert_response :not_found
      patch '/users/me', params: { name: 'Ana Martins' }, headers: bearer_headers, as: :json
    end
    assert_response :not_found
  end

  test 'patch preserves omitted and null fields and clears interests with an empty list' do
    create_profile
    with_jwks do
      patch '/users/me',
            params: { name: 'Ana Martins', academicLevel: nil, interests: [] },
            headers: bearer_headers,
            as: :json
    end

    assert_response :success
    assert_equal 'Ana Martins', response.parsed_body.fetch('name')
    assert_equal 'UNDERGRADUATE', response.parsed_body.fetch('academicLevel')
    assert_equal 'Computação', response.parsed_body.fetch('course')
    assert_empty response.parsed_body.fetch('interests')
    assert_equal 'Ana Martins', UserProfile.sole.name

    with_jwks do
      patch '/users/me',
            params: { affiliationStatus: 'ALUMNI', academicLevel: 'MASTERS' },
            headers: bearer_headers,
            as: :json
    end
    assert_response :success
    assert_equal 'ALUMNI', response.parsed_body.fetch('affiliationStatus')
    assert_equal 'MASTERS', response.parsed_body.fetch('academicLevel')
    assert_equal 'MASTER', UserProfile.sole.academic_level
    assert_nil UserProfile.sole.user_type
  end

  test 'profile department must refer to a department already registered in Campus' do
    ensure_profile_department!
    invalid_profile = valid_profile.merge(department: 'Departamento inventado')

    with_jwks { post '/users', params: invalid_profile, headers: bearer_headers, as: :json }

    assert_response :bad_request
    assert_equal 'department must match an existing Campus department', response.parsed_body.fetch('detail')
    assert_empty UserProfile.all

    create_profile
    with_jwks do
      patch '/users/me', params: { department: 'Departamento inventado' }, headers: bearer_headers, as: :json
    end

    assert_response :bad_request
    assert_equal 'Departamento de Ciência da Computação', UserProfile.sole.department
  end
end
