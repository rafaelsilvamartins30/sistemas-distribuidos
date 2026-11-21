# frozen_string_literal: true

require_relative 'support/campus_feed_tables_migration'
require_relative 'support/campus_poll_tables_migration'
require_relative 'support/campus_follow_notification_tables_migration'

# Aligns Campus with the institutional profile and social domains.
class BuildCampusProfilesAndSocialGraph < ActiveRecord::Migration[8.1]
  include CampusFeedTablesMigration
  include CampusPollTablesMigration
  include CampusFollowNotificationTablesMigration

  def change
    align_institutional_profiles
    move_courses_to_departments
    create_feed_and_community_space
    create_polls_and_options
    create_follows_and_notifications
  end

  private

  def align_institutional_profiles
    add_column :universities, :administrator_user_ids, :json, null: false, default: []
    add_institutional_unit_fields
    rename_column :academic_entities, :manager_user_ids, :administrator_user_ids
    rename_column :communities, :manager_user_ids, :administrator_user_ids
    add_reference :communities, :department, type: :string, foreign_key: true
  end

  def add_institutional_unit_fields
    change_table :academic_units, bulk: true do |table|
      table.text :description, null: false, default: ''
      table.text :general_info_markdown, null: false, default: ''
      table.string :logo_url
      table.string :banner_url
      table.json :links, null: false, default: []
      table.json :administrator_user_ids, null: false, default: []
      table.boolean :reference_only, null: false, default: false
    end
  end

  def move_courses_to_departments
    remove_reference :user_profiles, :academic_unit, foreign_key: true
    remove_reference :departments, :academic_unit, foreign_key: true
    remove_reference :courses, :academic_unit, foreign_key: true
    add_reference :courses, :department, type: :string, foreign_key: true
    add_index :courses, %i[department_id name], unique: true, where: 'department_id IS NOT NULL'
  end
end
