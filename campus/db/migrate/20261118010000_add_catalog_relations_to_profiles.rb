# frozen_string_literal: true

# Replaces free-text profile inputs with source-backed catalog identifiers while
# retaining the previous values as legacy data for rollback and migration safety.
class AddCatalogRelationsToProfiles < ActiveRecord::Migration[8.1]
  def up
    change_table :user_profiles, bulk: true do |table|
      table.rename :course, :legacy_course_name
      table.rename :department, :legacy_department_name
      table.change :legacy_course_name, :string, null: true
      table.change :legacy_department_name, :string, null: true
      table.references :academic_unit, type: :string, foreign_key: true
      table.references :course, type: :string, foreign_key: true
      table.references :department, type: :string, foreign_key: true
    end
  end

  def down
    change_table :user_profiles, bulk: true do |table|
      table.remove_references :department, foreign_key: true
      table.remove_references :course, foreign_key: true
      table.remove_references :academic_unit, foreign_key: true
      table.change :legacy_department_name, :string, null: false, default: ''
      table.change :legacy_course_name, :string, null: false, default: ''
      table.rename :legacy_department_name, :department
      table.rename :legacy_course_name, :course
    end
  end
end
