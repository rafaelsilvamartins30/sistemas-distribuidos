# frozen_string_literal: true

# Imports the source-backed academic catalog without inferring affiliations.
class LocalDemoCatalogSeeder
  include LocalDemoSeedSupport

  def initialize(catalog)
    @catalog = catalog
  end

  def call
    seed_university
    units = seed_units
    seed_departments
    seed_reference_courses(units)
    seed_reference_entities
    units
  end

  private

  def seed_university
    University.find_or_create_by!(id: University::SINGLETON_ID) do |university|
      university.assign_attributes(UNIVERSITY_ATTRIBUTES)
    end
  end

  def seed_units
    @catalog.fetch('academic_units').to_h do |row|
      unit = seed_unit(row)
      [row.fetch('code'), unit]
    end
  end

  def seed_unit(row)
    AcademicUnit.find_or_create_by!(id: stable_id("academic-unit/#{row.fetch('code')}")) do |record|
      record.assign_attributes(unit_attributes(row))
    end
  end

  def unit_attributes(row)
    source_url = row.fetch('source_url')
    {
      code: row.fetch('code'), name: row.fetch('name'), source_url: source_url,
      description: 'Unidade acadêmica listada no catálogo institucional de referência da UFLA.',
      general_info_markdown: reference_markdown(source_url),
      links: [{ label: 'Fonte institucional', url: source_url }], administrator_user_ids: [], reference_only: true
    }
  end

  def seed_departments
    @catalog.fetch('departments').each do |row|
      seed_department(row)
    end
  end

  def seed_department(row)
    Department.find_or_create_by!(id: department_id(row)) do |department|
      department.assign_attributes(department_attributes(row))
    end
  end

  def department_id(row)
    stable_id("department/#{row.fetch('unit_code')}/#{row.fetch('code')}")
  end

  def department_attributes(row)
    {
      name: row.fetch('name'), acronym: row.fetch('code'),
      description: 'Departamento listado no catálogo institucional de referência da UFLA.',
      general_info_markdown: reference_markdown(row.fetch('source_url')),
      links: [{ label: 'Fonte institucional', url: row.fetch('source_url') }], administrator_user_ids: [],
      source_url: row.fetch('source_url')
    }
  end

  def seed_reference_courses(units)
    @catalog.fetch('undergraduate_course_references').each do |row|
      unit = units.fetch(row.fetch('unit_code'))
      seed_course(row, unit)
    end
  end

  def seed_course(row, unit)
    key = "course/#{row.fetch('unit_code')}/#{row.fetch('name')}"
    Course.find_or_create_by!(id: stable_id(key)) do |course|
      course.name = row.fetch('name')
      course.source_url = row.fetch('source_url')
      course.source_note = ["Unidade de origem: #{unit.code}.", row['note']].compact.join(' ')
      course.reference_only = true
    end
  end

  def seed_reference_entities
    @catalog.fetch('extension_entities').each do |row|
      seed_reference_entity(row, "extension/#{row.fetch('source_category')}/#{row.fetch('name')}",
                            row.fetch('source_category'), row['affiliation_text_from_source'])
    end
    @catalog.fetch('other_student_organizations').each do |row|
      seed_reference_entity(row, "student-organization/#{row.fetch('source_category')}/#{row.fetch('name')}",
                            row.fetch('source_category'), nil)
    end
  end

  def seed_reference_entity(row, key, category, affiliation)
    source_url = row.fetch('source_url')
    AcademicEntity.find_or_create_by!(id: stable_id("academic-entity/#{key}")) do |entity|
      entity.assign_attributes(reference_entity_attributes(row, category, source_url, affiliation))
    end
  end

  def reference_entity_attributes(row, category, source_url, affiliation)
    {
      name: row.fetch('name'), description: REFERENCE_INFO,
      general_info_markdown: reference_markdown(source_url), entity_type: category, department_id: nil,
      links: [{ label: 'Fonte institucional', url: source_url }], administrator_user_ids: [],
      source_url: source_url, source_affiliation_text: affiliation, reference_only: true
    }
  end
end
