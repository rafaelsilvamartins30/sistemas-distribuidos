# frozen_string_literal: true

# Creates Campus-owned profile storage without importing legacy records.
class CreateUserProfiles < ActiveRecord::Migration[8.1]
  def change
    create_profile_table
    add_profile_indexes
    add_profile_constraints
  end

  private

  def create_profile_table
    create_table :user_profiles, id: :string do |table|
      add_identity_fields(table)
      add_academic_fields(table)
      table.json :interests, null: false, default: []
      table.timestamps null: false
    end
  end

  def add_identity_fields(table)
    table.string :keycloak_user_id, null: false, limit: 255
    table.string :name, null: false, limit: 255
    table.string :institutional_id, null: false, limit: 255
  end

  def add_academic_fields(table)
    table.string :affiliation_status, null: false, limit: 20
    table.string :academic_level, null: false, limit: 20
    table.string :course, null: false, limit: 255
    table.string :department, null: false, limit: 255
  end

  def add_profile_indexes
    add_index :user_profiles, :keycloak_user_id, unique: true
    add_index :user_profiles, :institutional_id, unique: true
  end

  def add_profile_constraints
    add_check_constraint :user_profiles,
                         "affiliation_status IN ('STUDENT', 'PROFESSOR', 'ALUMNI')",
                         name: 'user_profiles_affiliation_status_check'
    add_check_constraint :user_profiles,
                         "academic_level IN ('UNDERGRADUATE', 'MASTERS', 'DOCTORATE')",
                         name: 'user_profiles_academic_level_check'
  end
end
