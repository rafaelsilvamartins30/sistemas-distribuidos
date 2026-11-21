# frozen_string_literal: true

# Adds the singleton university and its university-wide departments.
class CreateUniversitiesAndDepartments < ActiveRecord::Migration[8.1]
  def change
    create_universities
    create_departments
    add_index :departments, :name
  end

  private

  def create_universities
    create_table :universities, id: :string do |table|
      university_columns(table)
      table.timestamps null: false
    end
  end

  def university_columns(table)
    table.string :name, null: false, limit: 255
    table.string :acronym, null: false, limit: 80
    table.text :description, null: false
    table.text :general_info_markdown, null: false
    table.string :current_term, null: false, limit: 32
    table.string :logo_url
    table.string :banner_url
    table.json :links, null: false, default: []
  end

  def create_departments
    create_table :departments, id: :string do |table|
      department_columns(table)
      table.timestamps null: false
    end
  end

  def department_columns(table)
    table.string :name, null: false, limit: 255
    table.string :acronym, null: false, limit: 80
    table.text :description, null: false
    table.text :general_info_markdown, null: false
    table.string :logo_url
    table.string :banner_url
    table.json :links, null: false, default: []
    table.json :administrator_user_ids, null: false, default: []
  end
end
