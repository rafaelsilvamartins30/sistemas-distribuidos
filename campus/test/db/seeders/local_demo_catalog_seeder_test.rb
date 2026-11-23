# frozen_string_literal: true

require 'test_helper'
require Rails.root.join('db/seeders/local_demo_support')
require Rails.root.join('db/seeders/local_demo_course_seeder')

class LocalDemoCourseSeederTest < ActiveSupport::TestCase
  setup do
    @unit = AcademicUnit.create!(
      id: SecureRandom.uuid, code: 'ICET', name: 'Instituto de Ciências Exatas e Tecnológicas',
      description: 'Unidade de teste.', general_info_markdown: 'Informações da unidade.', links: [],
      administrator_user_ids: []
    )
  end

  test 'reuses an existing reference course with the same name when its stable id changed' do
    existing = create_reference_course('Bacharelado Interdisciplinar em Inovação, Ciência e Tecnologia')

    seeded = LocalDemoCourseSeeder.seed_reference(row_for(existing.name, note: 'Curso de referência.'), @unit)

    assert_equal existing.id, seeded.id
    assert_equal 1, Course.where(name: existing.name).count
    assert_equal 'https://example.test/atualizada', seeded.reload.source_url
    assert_equal 'Unidade de origem: ICET. Curso de referência.', seeded.source_note
  end

  test 'does not replace an active department course with catalog reference data' do
    existing = create_active_course

    seeded = LocalDemoCourseSeeder.seed_reference(row_for(existing.name), @unit)

    assert_equal existing.id, seeded.id
    assert_equal 'https://example.test/curso', seeded.reload.source_url
    assert_not seeded.reference_only?
  end

  test 'promotes an existing reference course when a demo profile belongs to it' do
    existing = create_reference_course('Sistemas de Informação')
    department = create_department

    seeded = LocalDemoCourseSeeder.seed_profile({ 'courseName' => existing.name }, department)

    assert_equal existing.id, seeded.id
    assert_equal department.id, seeded.reload.department_id
    assert_not seeded.reference_only?
  end

  private

  def row_for(name, note: nil)
    { 'unit_code' => @unit.code, 'name' => name, 'source_url' => 'https://example.test/atualizada',
      'note' => note }
  end

  def create_reference_course(name)
    Course.create!(id: SecureRandom.uuid, name: name, source_url: 'https://example.test/antiga',
                   source_note: 'Fonte anterior.', reference_only: true)
  end

  def create_active_course
    department = create_department
    Course.create!(id: SecureRandom.uuid, department: department, name: 'Ciência da Computação',
                   source_url: 'https://example.test/curso', source_note: 'Curso ativo.', reference_only: false)
  end

  def create_department
    Department.create!(
      id: SecureRandom.uuid, name: 'Departamento de Computação', acronym: 'DCC',
      description: 'Departamento de teste.', general_info_markdown: 'Informações do departamento.', links: [],
      administrator_user_ids: []
    )
  end
end
