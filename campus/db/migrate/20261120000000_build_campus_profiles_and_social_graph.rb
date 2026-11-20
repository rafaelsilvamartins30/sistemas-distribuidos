# frozen_string_literal: true

# Aligns Campus with the institutional profile and social domains.
class BuildCampusProfilesAndSocialGraph < ActiveRecord::Migration[8.1]
  def change
    align_institutional_profiles
    move_courses_to_departments
    create_feed_and_community_space
    create_follows_and_notifications
  end

  private

  def align_institutional_profiles
    add_column :universities, :administrator_user_ids, :json, null: false, default: []

    change_table :academic_units, bulk: true do |table|
      table.text :description, null: false, default: ''
      table.text :general_info_markdown, null: false, default: ''
      table.string :logo_url
      table.string :banner_url
      table.json :links, null: false, default: []
      table.json :administrator_user_ids, null: false, default: []
      table.boolean :reference_only, null: false, default: false
    end

    rename_column :academic_entities, :manager_user_ids, :administrator_user_ids
    rename_column :communities, :manager_user_ids, :administrator_user_ids
    add_reference :communities, :department, type: :string, foreign_key: true
  end

  def move_courses_to_departments
    remove_reference :user_profiles, :academic_unit, foreign_key: true
    remove_reference :departments, :academic_unit, foreign_key: true
    remove_reference :courses, :academic_unit, foreign_key: true

    add_reference :courses, :department, type: :string, foreign_key: true
    add_index :courses, %i[department_id name], unique: true, where: 'department_id IS NOT NULL'
  end

  def create_feed_and_community_space
    create_feed_posts
    create_community_space_posts
    create_comments
    create_polls
    create_poll_options
    create_poll_votes
  end

  def create_feed_posts
    create_table :feed_posts, id: :string do |table|
      table.string :owner_type, null: false, limit: 32
      table.string :owner_id, null: false
      table.string :author_user_id, null: false
      table.string :term, null: false, limit: 32
      table.text :body, null: false, default: ''
      table.json :image_urls, null: false, default: []
      table.string :external_url
      table.datetime :available_until
      table.datetime :archived_at
      table.timestamps null: false
    end
    add_check_constraint :feed_posts,
                         "owner_type IN ('UNIVERSITY', 'ACADEMIC_UNIT', 'DEPARTMENT', 'ACADEMIC_ENTITY', 'COMMUNITY')",
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
      table.datetime :available_until
      table.datetime :archived_at
      table.timestamps null: false
    end
    add_index :community_space_posts, %i[community_id created_at]
  end

  def create_comments
    create_table :comments, id: :string do |table|
      table.references :community_space_post, type: :string, null: false, foreign_key: true
      table.references :parent_comment, type: :string, index: false,
                                        foreign_key: { to_table: :comments }
      table.string :author_user_id, null: false
      table.text :body, null: false
      table.datetime :archived_at
      table.timestamps null: false
    end
    add_index :comments, %i[community_space_post_id created_at]
    add_index :comments, :parent_comment_id
  end

  def create_polls
    create_table :polls, id: :string do |table|
      table.references :feed_post, type: :string, index: false, foreign_key: true
      table.references :community_space_post, type: :string, index: false, foreign_key: true
      table.string :question, null: false
      table.datetime :closes_at
      table.timestamps null: false
    end
    add_check_constraint :polls,
                         '(feed_post_id IS NOT NULL AND community_space_post_id IS NULL) OR ' +
                           '(feed_post_id IS NULL AND community_space_post_id IS NOT NULL)',
                         name: 'polls_single_source_check'
    add_index :polls, :feed_post_id, unique: true, where: 'feed_post_id IS NOT NULL'
    add_index :polls, :community_space_post_id, unique: true,
              where: 'community_space_post_id IS NOT NULL', name: 'index_polls_on_community_space_post_id'
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

  def create_follows_and_notifications
    create_follows
    create_notifications
  end

  def create_follows
    create_table :follows, id: :string do |table|
      table.string :user_id, null: false
      table.string :target_type, null: false, limit: 32
      table.string :target_id, null: false
      table.datetime :unfollowed_at
      table.datetime :created_at, null: false
    end
    add_check_constraint :follows,
                         "target_type IN ('UNIVERSITY', 'ACADEMIC_UNIT', 'DEPARTMENT', 'ACADEMIC_ENTITY', 'COMMUNITY')",
                         name: 'follows_target_type_check'
    add_index :follows, %i[user_id target_type target_id], unique: true
    add_index :follows, %i[target_type target_id unfollowed_at]
  end

  def create_notifications
    create_table :notifications, id: :string do |table|
      table.string :recipient_user_id, null: false
      table.string :actor_user_id
      table.string :event_type, null: false, limit: 64
      table.string :title, null: false
      table.text :message, null: false
      table.string :resource_type, null: false, limit: 64
      table.string :resource_id, null: false
      table.datetime :read_at
      table.timestamps null: false
    end
    add_index :notifications, %i[recipient_user_id created_at]
    add_index :notifications, %i[recipient_user_id read_at created_at],
              name: 'index_notifications_on_recipient_read_created'
  end
end
