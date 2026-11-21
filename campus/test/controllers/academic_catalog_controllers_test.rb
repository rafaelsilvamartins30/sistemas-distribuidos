# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class AcademicCatalogControllersTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'academic unit profiles are independent peers to departments' do
    unit = create_unit(code: 'ICET', name: 'Instituto de Ciências Exatas')
    department = create_department

    with_jwks { get "/academic-units/#{unit.id}", headers: bearer_headers }

    assert_response :success
    assert_equal unit.id, response.parsed_body.fetch('id')
    assert_equal 'Instituto de Ciências Exatas', response.parsed_body.fetch('name')
    assert_nil response.parsed_body.fetch('administratorUserIds')
    assert_not_includes response.parsed_body.keys, 'departments'
    assert_not_equal unit.id, department.id
  end

  test 'courses are listed through their department and reference-only entries are hidden' do
    department = create_department
    active = create_course(department: department, id: '20000000-0000-4000-8000-000000000010',
                           name: 'Ciência da Computação', reference_only: false)
    Course.create!(id: '20000000-0000-4000-8000-000000000011', department: nil,
                   name: 'Curso de referência', reference_only: true)

    with_jwks { get "/courses?departmentId=#{department.id}&page=0&size=10", headers: bearer_headers }

    assert_response :success
    assert_equal([active.id], response.parsed_body.fetch('items').map { |item| item.fetch('id') })
    assert_equal department.id, response.parsed_body.fetch('items').sole.fetch('departmentId')
    with_jwks { get "/courses/#{active.id}", headers: bearer_headers }
    assert_response :success
    assert_equal department.id, response.parsed_body.fetch('departmentId')
  end

  test 'course list requires an existing department and rejects invalid pagination' do
    with_jwks do
      get '/courses', headers: bearer_headers
      assert_response :bad_request
      get '/courses?departmentId=missing&page=-1', headers: bearer_headers
      assert_response :not_found
      get '/courses/missing-course', headers: bearer_headers
      assert_response :not_found
      get '/academic-units/missing-unit', headers: bearer_headers
      assert_response :not_found
    end
  end

  private

  def create_unit(code:, name:)
    AcademicUnit.create!(id: SecureRandom.uuid, code: code, name: name, source_url: 'https://example.edu.br',
                         description: 'Unidade de teste.', general_info_markdown: 'Informações da unidade.', links: [],
                         administrator_user_ids: [])
  end

  def create_department
    Department.create!(id: SecureRandom.uuid, name: 'Departamento de Teste', acronym: 'DT',
                       description: 'Departamento de teste.', general_info_markdown: 'Informações do departamento.',
                       links: [], administrator_user_ids: [])
  end

  def create_course(department:, id:, name:, reference_only:)
    Course.create!(id: id, department: department, name: name, source_url: 'https://example.edu.br',
                   source_note: 'Registro de teste.', reference_only: reference_only)
  end
end
