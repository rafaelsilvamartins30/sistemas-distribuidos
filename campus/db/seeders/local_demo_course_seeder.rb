# frozen_string_literal: true

# Reconciles demo courses by stable ID or by the database's unique course name.
class LocalDemoCourseSeeder
  def self.seed_reference(row, unit)
    name = row.fetch('name')
    id = LocalDemoSeedSupport.stable_id("course/#{row.fetch('unit_code')}/#{name}")
    attributes = {
      source_url: row.fetch('source_url'),
      source_note: ["Unidade de origem: #{unit.code}.", row['note']].compact.join(' '),
      reference_only: true
    }
    new(id:, name:, attributes:, preserve_active: true).call
  end

  def self.seed_profile(data, department)
    name = data.fetch('courseName')
    id = LocalDemoSeedSupport.stable_id("course/department/#{department.id}/#{name}")
    new(id:, name:, attributes: { department:, reference_only: false }, preserve_active: false).call
  end

  def initialize(id:, name:, attributes:, preserve_active:)
    @id = id
    @name = name
    @attributes = attributes
    @preserve_active = preserve_active
  end

  def call
    course = Course.find_by(id: @id) || Course.find_by(name: @name) || Course.new(id: @id, name: @name)
    return course if @preserve_active && course.persisted? && !course.reference_only?

    course.update!(@attributes)
    course
  end
end
