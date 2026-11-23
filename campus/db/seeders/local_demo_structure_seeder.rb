# frozen_string_literal: true

# Seeds the base university (clean & demo) and the lean demo institutional structure.
class LocalDemoStructureSeeder
  include LocalDemoSeedSupport

  DEPARTMENTS = [
    {
      code: 'DCC', name: 'Departamento de Ciência da Computação',
      description: 'Departamento responsável pelos cursos e pesquisas em Computação.',
      course_name: 'Ciência da Computação', entity_slug: 'cacomp',
      entity_name: 'Centro Acadêmico de Computação (CACOMP)', entity_type: 'CENTRO ACADÊMICO',
      community_slug: 'dcc', community_name: 'Comunidade de Computação — DCC', community_category: 'Tecnologia'
    },
    {
      code: 'DEG', name: 'Departamento de Engenharia',
      description: 'Departamento responsável pelos cursos e projetos em Engenharia.',
      course_name: 'Engenharia de Controle e Automação', entity_slug: 'laeng',
      entity_name: 'Liga Acadêmica de Engenharia (LAENG)', entity_type: 'LIGA ACADÊMICA',
      community_slug: 'deg', community_name: 'Comunidade de Engenharia — DEG', community_category: 'Engenharia'
    }
  ].freeze

  def initialize(admin_sub)
    @admin_sub = admin_sub
  end

  def seed_base_university
    university = University.find_or_initialize_by(id: University::SINGLETON_ID)
    university.assign_attributes(UNIVERSITY_ATTRIBUTES)
    university.administrator_user_ids = (university.administrator_user_ids + [@admin_sub]).uniq
    university.save!
    seed_current_semester(university)
    university
  end

  def seed_demo_structure
    seed_academic_unit
    seed_university_community
    DEPARTMENTS.each { |spec| seed_department_bundle(spec) }
  end

  private

  def seed_current_semester(university)
    semester = Semester.find_or_initialize_by(university: university, name: university.current_term)
    semester.assign_attributes(starts_on: Date.new(2026, 8, 3), ends_on: Date.new(2026, 12, 18))
    semester.save!
  end

  def seed_academic_unit
    unit = AcademicUnit.find_or_initialize_by(id: stable_id('academic-unit/ICET'))
    unit.assign_attributes(
      code: 'ICET', name: 'Instituto de Ciências Exatas e Tecnológicas',
      description: 'Unidade acadêmica de ciências exatas, computação e engenharias da UFLA.',
      general_info_markdown: 'Unidade acadêmica principal da demonstração local da UNIR.',
      links: [], administrator_user_ids: [@admin_sub], reference_only: false
    )
    unit.save!
  end

  def seed_university_community
    community = Community.find_or_initialize_by(id: stable_id('community/universidade'))
    community.assign_attributes(
      name: 'Comunidade Geral da UFLA', description: 'Espaço institucional aberto a toda a comunidade universitária.',
      general_info_markdown: 'Comunidade oficial da universidade para avisos e discussões gerais.',
      category: 'Institucional', department_id: nil, links: [], administrator_user_ids: [@admin_sub]
    )
    community.save!
  end

  def seed_department_bundle(spec)
    department = seed_department(spec)
    seed_course(spec, department)
    seed_entity(spec, department)
    seed_department_community(spec, department)
  end

  def seed_department(spec)
    department = Department.find_or_initialize_by(id: stable_id("department/ICET/#{spec.fetch(:code)}"))
    department.assign_attributes(
      name: spec.fetch(:name), acronym: spec.fetch(:code), description: spec.fetch(:description),
      general_info_markdown: "#{spec.fetch(:name)} — Instituto de Ciências Exatas e Tecnológicas (ICET).",
      links: [], administrator_user_ids: [@admin_sub]
    )
    department.save!
    department
  end

  def seed_course(spec, department)
    course = Course.find_or_initialize_by(id: stable_id("course/#{spec.fetch(:code)}/#{spec.fetch(:course_name)}"))
    course.assign_attributes(name: spec.fetch(:course_name), department: department, reference_only: false)
    course.save!
  end

  def seed_entity(spec, department)
    entity = AcademicEntity.find_or_initialize_by(id: stable_id("academic-entity/#{spec.fetch(:entity_slug)}"))
    entity.assign_attributes(
      name: spec.fetch(:entity_name), description: "Entidade estudantil vinculada ao #{department.name}.",
      general_info_markdown: "Entidade acadêmica do departamento #{department.acronym}.",
      entity_type: spec.fetch(:entity_type), department: department,
      links: [], administrator_user_ids: [@admin_sub], reference_only: false
    )
    entity.save!
  end

  def seed_department_community(spec, department)
    community = Community.find_or_initialize_by(id: stable_id("community/#{spec.fetch(:community_slug)}"))
    community.assign_attributes(
      name: spec.fetch(:community_name), description: "Comunidade acadêmica vinculada ao #{department.name}.",
      general_info_markdown: "Espaço de troca entre estudantes e docentes do #{department.acronym}.",
      category: spec.fetch(:community_category), department: department, links: [], administrator_user_ids: [@admin_sub]
    )
    community.save!
  end
end
