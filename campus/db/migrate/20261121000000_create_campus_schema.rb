# frozen_string_literal: true

# Consolidated initial schema for the Campus service.
class CreateCampusSchema < ActiveRecord::Migration[8.1]
  # Institutional catalog tables for universities, units, departments, courses, and organizations.
  module CatalogTables
    private

    def create_catalog_tables
      create_universities
      create_semesters
      create_academic_units
      create_departments
      create_courses
      create_academic_entities
      create_communities
    end

    def create_universities
      create_table :universities, id: :string do |table|
        add_university_columns(table)
        table.timestamps null: false
      end
    end

    def add_university_columns(table)
      table.string :name, null: false, limit: 255
      table.string :acronym, null: false, limit: 80
      table.text :description, :general_info_markdown, null: false
      table.string :current_term, null: false, limit: 32
      table.string :logo_url, :banner_url
      table.json :links, :administrator_user_ids, null: false, default: []
    end

    def create_semesters
      create_table :semesters, id: :string do |table|
        table.references :university, type: :string, null: false, foreign_key: true
        table.string :name, null: false, limit: 6
        table.date :starts_on, :ends_on, null: false
        table.timestamps null: false
      end
      add_index :semesters, %i[university_id name], unique: true
      add_check_constraint :semesters, 'ends_on >= starts_on', name: 'semesters_date_order_check'
    end

    def create_academic_units
      create_table :academic_units, id: :string do |table|
        add_academic_unit_columns(table)
        table.timestamps null: false
      end
      add_index :academic_units, :code, unique: true
      add_index :academic_units, :name
    end

    def add_academic_unit_columns(table)
      table.string :code, null: false, limit: 80
      table.string :name, null: false, limit: 255
      table.string :source_url, :logo_url, :banner_url
      table.text :description, :general_info_markdown, null: false, default: ''
      table.json :links, :administrator_user_ids, null: false, default: []
      table.boolean :reference_only, null: false, default: false
    end

    def create_departments
      create_table :departments, id: :string do |table|
        add_department_columns(table)
        table.timestamps null: false
      end
      add_index :departments, :name
    end

    def add_department_columns(table)
      table.string :name, null: false, limit: 255
      table.string :acronym, null: false, limit: 80
      table.text :description, :general_info_markdown, null: false
      table.string :logo_url, :banner_url, :source_url
      table.json :links, :administrator_user_ids, null: false, default: []
    end

    def create_courses
      create_table :courses, id: :string do |table|
        table.string :name, null: false, limit: 255, index: true
        table.string :source_url
        table.text :source_note
        table.boolean :reference_only, null: false, default: true
        table.references :department, type: :string, foreign_key: true
        table.timestamps null: false
      end
      add_index :courses, %i[department_id name], unique: true, where: 'department_id IS NOT NULL'
    end

    def create_academic_entities
      create_table :academic_entities, id: :string do |table|
        add_academic_entity_columns(table)
        table.timestamps null: false
      end
    end

    def add_academic_entity_columns(table)
      table.string :name, :entity_type, null: false, limit: 255, index: true
      table.text :description, :general_info_markdown, null: false
      table.references :department, type: :string, foreign_key: true
      table.string :logo_url, :banner_url, :source_url, :source_affiliation_text
      table.json :links, :administrator_user_ids, null: false, default: []
      table.boolean :reference_only, null: false, default: false
    end

    def create_communities
      create_table :communities, id: :string do |table|
        table.string :name, null: false, limit: 255, index: true
        table.text :description, :general_info_markdown, null: false
        table.string :category, limit: 255, index: true
        table.references :department, type: :string, foreign_key: true
        table.string :logo_url, :banner_url
        table.json :links, :administrator_user_ids, null: false, default: []
        table.timestamps null: false
      end
    end
  end

  # User profiles, professor affiliations, and institutional verification requests.
  module ProfileTables
    private

    def create_profile_tables
      create_user_profiles
      create_professor_affiliations
      create_requests
    end

    def create_user_profiles
      create_table :user_profiles, id: :string do |table|
        add_user_profile_identity_fields(table)
        add_user_profile_academic_fields(table)
        table.timestamps null: false
      end
      add_user_profile_constraints
    end

    def add_user_profile_identity_fields(table)
      table.string :keycloak_user_id, :name, :registration_code, null: false, limit: 255
      table.string :legacy_affiliation_status, :academic_level, null: false, limit: 20
      table.string :user_type
    end

    def add_user_profile_academic_fields(table)
      table.string :legacy_course_name, :legacy_department_name
      table.json :interests, null: false, default: []
      table.references :course, type: :string, foreign_key: true
      table.references :department, type: :string, foreign_key: true
    end

    def add_user_profile_constraints
      add_index :user_profiles, :keycloak_user_id, unique: true
      add_index :user_profiles, :registration_code, unique: true
      add_check_constraint :user_profiles, "legacy_affiliation_status IN ('STUDENT', 'PROFESSOR', 'ALUMNI')",
                           name: 'user_profiles_legacy_affiliation_status_check'
      add_check_constraint :user_profiles, "user_type IS NULL OR user_type IN ('STUDENT', 'PROFESSOR', 'STAFF')",
                           name: 'user_profiles_user_type_check'
      add_check_constraint :user_profiles, "academic_level IN ('UNDERGRAD', 'GRADUATE', 'MASTER', 'PHD')",
                           name: 'user_profiles_academic_level_check'
    end

    def create_professor_affiliations
      create_table :professor_affiliations, id: false do |table|
        table.string :user_id, :department_id, null: false
        table.datetime :joined_at, null: false
        table.string :status, null: false, limit: 32
      end
      add_professor_affiliation_constraints
    end

    def add_professor_affiliation_constraints
      add_foreign_key :professor_affiliations, :user_profiles, column: :user_id
      add_foreign_key :professor_affiliations, :departments
      add_index :professor_affiliations, :user_id, unique: true
      add_index :professor_affiliations, :department_id
      add_check_constraint :professor_affiliations, "status IN ('ACTIVE', 'ON_LEAVE', 'INACTIVE')",
                           name: 'professor_affiliations_status_check'
    end

    def create_requests
      create_table :requests, id: :string do |table|
        add_request_columns(table)
        table.timestamps null: false
      end
      add_request_indexes
      add_request_constraints
    end

    def add_request_columns(table)
      table.string :type, null: false, limit: 64
      table.string :title, :requested_by_user_id, null: false, limit: 255
      table.string :target_department_id
      table.json :payload_json, null: false, default: {}
      table.string :status, null: false, limit: 32
      table.datetime :reviewed_at
      table.string :reviewed_by_user_id, limit: 255
    end

    def add_request_indexes
      add_foreign_key :requests, :departments, column: :target_department_id
      add_index :requests, :target_department_id
      add_index :requests, %i[requested_by_user_id type status]
      add_index :requests, %i[requested_by_user_id target_department_id type],
                unique: true,
                where: "type = 'PROFESSOR_VERIFICATION' AND status = 'PENDING'",
                name: 'index_requests_unique_pending_professor_verification'
    end

    def add_request_constraints
      add_check_constraint :requests, "type IN ('PROFESSOR_VERIFICATION', 'COMMUNITY_CREATION', 'ENTITY_CREATION')",
                           name: 'requests_type_check'
      add_check_constraint :requests, "status IN ('PENDING', 'APPROVED', 'REJECTED')",
                           name: 'requests_status_check'
    end
  end

  # Feed posts, community space posts, and threaded comments.
  module FeedTables
    private

    def create_feed_tables
      create_feed_posts
      create_community_space_posts
      create_comments
    end

    def create_feed_posts
      create_table :feed_posts, id: :string do |table|
        add_feed_post_columns(table)
        table.timestamps null: false
      end
      add_feed_post_constraints
    end

    def add_feed_post_columns(table)
      table.string :owner_type, :term, null: false, limit: 32
      table.string :owner_id, :author_user_id, null: false
      table.text :body, null: false, default: ''
      table.json :image_urls, null: false, default: []
      table.string :external_url
      table.datetime :available_until, :archived_at
    end

    def add_feed_post_constraints
      add_check_constraint :feed_posts,
                           "owner_type IN ('UNIVERSITY', 'ACADEMIC_UNIT', 'DEPARTMENT', " \
                           "'ACADEMIC_ENTITY', 'COMMUNITY')",
                           name: 'feed_posts_owner_type_check'
      add_index :feed_posts, %i[owner_type owner_id term created_at], name: 'index_feed_posts_on_owner_term_created'
      add_index :feed_posts, %i[term created_at]
    end

    def create_community_space_posts
      create_table :community_space_posts, id: :string do |table|
        table.references :community, type: :string, null: false, foreign_key: true
        table.string :author_user_id, null: false
        table.text :body, null: false
        table.json :image_urls, null: false, default: []
        table.string :external_url
        table.datetime :available_until, :archived_at
        table.timestamps null: false
      end
      add_index :community_space_posts, %i[community_id created_at]
    end

    def create_comments
      create_table :comments, id: :string do |table|
        table.references :community_space_post, type: :string, null: false, foreign_key: true
        table.references :parent_comment, type: :string, index: false, foreign_key: { to_table: :comments }
        table.string :author_user_id, null: false
        table.text :body, null: false
        table.datetime :archived_at
        table.timestamps null: false
      end
      add_index :comments, %i[community_space_post_id created_at]
      add_index :comments, :parent_comment_id
    end
  end

  # Polls, follows, and user notification inbox tables.
  module SocialTables
    private

    def create_social_tables
      create_polls
      create_poll_options
      create_poll_votes
      create_follows
      create_notifications
    end

    def create_polls
      create_table :polls, id: :string do |table|
        table.references :feed_post, type: :string, index: false, foreign_key: true
        table.references :community_space_post, type: :string, index: false, foreign_key: true
        table.string :question, null: false
        table.datetime :closes_at
        table.timestamps null: false
      end
      add_poll_constraints
    end

    def add_poll_constraints
      add_check_constraint :polls,
                           '(feed_post_id IS NOT NULL AND community_space_post_id IS NULL) OR ' \
                           '(feed_post_id IS NULL AND community_space_post_id IS NOT NULL)',
                           name: 'polls_single_source_check'
      add_index :polls, :feed_post_id, unique: true, where: 'feed_post_id IS NOT NULL'
      add_index :polls, :community_space_post_id, unique: true, where: 'community_space_post_id IS NOT NULL',
                                                  name: 'index_polls_on_community_space_post_id'
    end

    def create_poll_options
      create_table :poll_options, id: :string do |table|
        table.references :poll, type: :string, null: false, foreign_key: true
        table.string :text, null: false
        table.integer :position, null: false
        table.timestamps null: false
      end
      add_index :poll_options, %i[poll_id position], unique: true
    end

    def create_poll_votes
      create_table :poll_votes, id: :string do |table|
        table.references :poll, type: :string, null: false, foreign_key: true
        table.references :poll_option, type: :string, null: false, foreign_key: true
        table.string :user_id, null: false
        table.datetime :created_at, null: false
      end
      add_index :poll_votes, %i[poll_id user_id], unique: true
    end

    def create_follows
      create_table :follows, id: :string do |table|
        table.string :user_id, :target_id, null: false
        table.string :target_type, null: false, limit: 32
        table.datetime :unfollowed_at
        table.datetime :created_at, null: false
      end
      add_follow_constraints
    end

    def add_follow_constraints
      add_check_constraint :follows,
                           "target_type IN ('UNIVERSITY', 'ACADEMIC_UNIT', 'DEPARTMENT', " \
                           "'ACADEMIC_ENTITY', 'COMMUNITY')",
                           name: 'follows_target_type_check'
      add_index :follows, %i[user_id target_type target_id], unique: true
      add_index :follows, %i[target_type target_id unfollowed_at]
    end

    def create_notifications
      create_table :notifications, id: :string do |table|
        add_notification_columns(table)
        table.timestamps null: false
      end
      add_index :notifications, %i[recipient_user_id created_at]
      add_index :notifications, %i[recipient_user_id read_at created_at],
                name: 'index_notifications_on_recipient_read_created'
    end

    def add_notification_columns(table)
      table.string :recipient_user_id, :title, :resource_id, null: false
      table.string :actor_user_id
      table.string :event_type, :resource_type, null: false, limit: 64
      table.text :message, null: false
      table.datetime :read_at
    end
  end

  include CatalogTables
  include ProfileTables
  include FeedTables
  include SocialTables

  def change
    create_catalog_tables
    create_profile_tables
    create_feed_tables
    create_social_tables
  end
end
