# frozen_string_literal: true

# Stores the source-backed academic unit and course reference catalog in Campus.
class CreateAcademicCatalog < ActiveRecord::Migration[8.1]
  def change
    create_academic_units
    create_courses
    add_reference :departments, :academic_unit, type: :string, foreign_key: true
    add_column :departments, :source_url, :string
  end

  private

  def create_academic_units
    create_table :academic_units, id: :string do |table|
      table.string :code, null: false, limit: 80
      table.string :name, null: false, limit: 255
      table.string :source_url
      table.timestamps null: false
    end
    add_index :academic_units, :code, unique: true
    add_index :academic_units, :name
  end

  def create_courses
    create_table :courses, id: :string do |table|
      table.string :academic_unit_id, null: false
      table.string :name, null: false, limit: 255
      table.string :source_url
      table.text :source_note
      table.boolean :reference_only, null: false, default: true
      table.timestamps null: false
    end
    index_courses
  end

  def index_courses
    add_foreign_key :courses, :academic_units
    add_index :courses, %i[academic_unit_id name], unique: true
    add_index :courses, :name
  end
end
