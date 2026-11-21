# frozen_string_literal: true

# Adds polls, their options, and one-vote-per-user storage.
module CampusPollTablesMigration
  private

  def create_polls_and_options
    create_polls
    create_poll_options
    create_poll_votes
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
    add_index :polls, :community_space_post_id, unique: true,
                                                where: 'community_space_post_id IS NOT NULL',
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
end
