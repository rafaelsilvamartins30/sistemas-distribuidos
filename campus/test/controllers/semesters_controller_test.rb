# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class SemestersControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'university administrators create and edit semester date ranges' do
    university = create_university(administrators: [KeycloakJwtTestHelpers::SUBJECT])

    with_jwks do
      post '/semesters', params: { name: '2026/2', startOn: '2026-08-01', endOn: '2026-12-20' },
                         headers: bearer_headers, as: :json
    end

    assert_response :created
    semester_id = response.parsed_body.fetch('id')
    assert_equal '2026/2', response.parsed_body.fetch('name')
    assert_equal '2026-08-01', response.parsed_body.fetch('startOn')

    with_jwks do
      patch "/semesters/#{semester_id}", params: { endOn: '2026-12-22' }, headers: bearer_headers, as: :json
    end

    assert_response :success
    assert_equal '2026-12-22', response.parsed_body.fetch('endOn')

    with_jwks { get '/semesters?page=0&size=10', headers: bearer_headers }

    assert_response :success
    assert_equal university.id, Semester.find(semester_id).university_id
    assert_equal ['2026/2'], response.parsed_body.fetch('items').map { |item| item.fetch('name') }
  end

  test 'semester writes require the university administrator subject and validate the simple name and dates' do
    create_university(administrators: ['university-admin'])

    with_jwks do
      post '/semesters', params: { name: '2026/2', startOn: '2026-08-01', endOn: '2026-12-20' },
                         headers: bearer_headers(subject: KeycloakJwtTestHelpers::SUBJECT, roles: ['PLATFORM_ADMIN']),
                         as: :json
    end
    assert_response :forbidden

    with_jwks do
      post '/semesters', params: { name: '2026-3', startOn: '2026-12-20', endOn: '2026-08-01' },
                         headers: bearer_headers(subject: 'university-admin'), as: :json
    end
    assert_response :unprocessable_entity
    assert_empty Semester.all
  end

  private

  def create_university(administrators:)
    University.create!(id: University::SINGLETON_ID, name: 'Universidade de Teste', acronym: 'UT',
                       description: 'Descrição.', general_info_markdown: 'Informações.', current_term: '2026/2',
                       links: [], administrator_user_ids: administrators)
  end
end
