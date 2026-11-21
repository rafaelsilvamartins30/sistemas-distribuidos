# frozen_string_literal: true

# Stores fields in the approved Campus vocabulary while retaining legacy API values.
class AlignUserProfilesWithCampusModel < ActiveRecord::Migration[8.1]
  def up
    remove_check_constraints
    rename_profile_columns
    add_user_type_column
    map_academic_levels
    map_user_types
    add_campus_constraints
  end

  def down
    reject_unmapped_graduate_level
    remove_campus_constraints
    map_legacy_academic_levels
    remove_column :user_profiles, :user_type
    restore_profile_columns
    add_legacy_constraints
  end

  private

  def remove_check_constraints
    remove_check_constraint :user_profiles, name: 'user_profiles_affiliation_status_check'
    remove_check_constraint :user_profiles, name: 'user_profiles_academic_level_check'
  end

  def rename_profile_columns
    rename_column :user_profiles, :institutional_id, :registration_code
    rename_index_if_present('index_user_profiles_on_institutional_id', 'index_user_profiles_on_registration_code')
    rename_column :user_profiles, :affiliation_status, :legacy_affiliation_status
  end

  def add_user_type_column
    add_column :user_profiles, :user_type, :string
  end

  def map_academic_levels
    execute <<~SQL.squish
      UPDATE user_profiles
      SET academic_level = CASE academic_level
        WHEN 'UNDERGRADUATE' THEN 'UNDERGRAD'
        WHEN 'MASTERS' THEN 'MASTER'
        WHEN 'DOCTORATE' THEN 'PHD'
        ELSE academic_level
      END
    SQL
  end

  def map_user_types
    execute <<~SQL.squish
      UPDATE user_profiles
      SET user_type = CASE legacy_affiliation_status
        WHEN 'STUDENT' THEN 'STUDENT'
        WHEN 'PROFESSOR' THEN 'PROFESSOR'
        ELSE NULL
      END
    SQL
  end

  def add_campus_constraints
    add_check_constraint :user_profiles,
                         "legacy_affiliation_status IN ('STUDENT', 'PROFESSOR', 'ALUMNI')",
                         name: 'user_profiles_legacy_affiliation_status_check'
    add_check_constraint :user_profiles,
                         "user_type IS NULL OR user_type IN ('STUDENT', 'PROFESSOR', 'STAFF')",
                         name: 'user_profiles_user_type_check'
    add_check_constraint :user_profiles,
                         "academic_level IN ('UNDERGRAD', 'GRADUATE', 'MASTER', 'PHD')",
                         name: 'user_profiles_academic_level_check'
  end

  def reject_unmapped_graduate_level
    return unless select_value("SELECT 1 FROM user_profiles WHERE academic_level = 'GRADUATE' LIMIT 1")

    raise ActiveRecord::IrreversibleMigration, 'GRADUATE has no equivalent in the public profile contract'
  end

  def remove_campus_constraints
    remove_check_constraint :user_profiles, name: 'user_profiles_legacy_affiliation_status_check'
    remove_check_constraint :user_profiles, name: 'user_profiles_user_type_check'
    remove_check_constraint :user_profiles, name: 'user_profiles_academic_level_check'
  end

  def map_legacy_academic_levels
    execute <<~SQL.squish
      UPDATE user_profiles
      SET academic_level = CASE academic_level
        WHEN 'UNDERGRAD' THEN 'UNDERGRADUATE'
        WHEN 'MASTER' THEN 'MASTERS'
        WHEN 'PHD' THEN 'DOCTORATE'
        ELSE academic_level
      END
    SQL
  end

  def restore_profile_columns
    rename_column :user_profiles, :legacy_affiliation_status, :affiliation_status
    rename_column :user_profiles, :registration_code, :institutional_id
    rename_index_if_present('index_user_profiles_on_registration_code', 'index_user_profiles_on_institutional_id')
  end

  def rename_index_if_present(old_name, new_name)
    rename_index :user_profiles, old_name, new_name if index_name_exists?(:user_profiles, old_name)
  end

  def add_legacy_constraints
    add_check_constraint :user_profiles,
                         "affiliation_status IN ('STUDENT', 'PROFESSOR', 'ALUMNI')",
                         name: 'user_profiles_affiliation_status_check'
    add_check_constraint :user_profiles,
                         "academic_level IN ('UNDERGRADUATE', 'MASTERS', 'DOCTORATE')",
                         name: 'user_profiles_academic_level_check'
  end
end
