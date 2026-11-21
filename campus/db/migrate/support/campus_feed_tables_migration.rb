# frozen_string_literal: true

# Adds feed, community space, and comment tables to the Campus schema.
module CampusFeedTablesMigration
  private

  def create_feed_and_community_space
    create_feed_posts
    create_community_space_posts
    create_comments
  end

  def create_feed_posts
    create_table :feed_posts, id: :string do |table|
      add_feed_post_owner_fields(table)
      add_feed_post_content_fields(table)
      table.timestamps null: false
    end
    add_feed_post_constraints
  end

  def add_feed_post_owner_fields(table)
    table.string :owner_type, null: false, limit: 32
    table.string :owner_id, null: false
    table.string :author_user_id, null: false
    table.string :term, null: false, limit: 32
  end

  def add_feed_post_content_fields(table)
    table.text :body, null: false, default: ''
    table.json :image_urls, null: false, default: []
    table.string :external_url
    table.datetime :available_until
    table.datetime :archived_at
  end

  def add_feed_post_constraints
    add_check_constraint :feed_posts,
                         "owner_type IN ('UNIVERSITY', 'ACADEMIC_UNIT', 'DEPARTMENT', 'ACADEMIC_ENTITY', 'COMMUNITY')",
                         name: 'feed_posts_owner_type_check'
    add_index :feed_posts, %i[owner_type owner_id term created_at], name: 'index_feed_posts_on_owner_term_created'
    add_index :feed_posts, %i[term created_at]
  end

  def create_community_space_posts
    create_table :community_space_posts, id: :string do |table|
      add_community_space_post_fields(table)
      table.timestamps null: false
    end
    add_index :community_space_posts, %i[community_id created_at]
  end

  def add_community_space_post_fields(table)
    table.references :community, type: :string, null: false, foreign_key: true
    table.string :author_user_id, null: false
    table.text :body, null: false
    table.json :image_urls, null: false, default: []
    table.string :external_url
    table.datetime :available_until
    table.datetime :archived_at
  end

  def create_comments
    create_table :comments, id: :string do |table|
      add_comment_fields(table)
      table.timestamps null: false
    end
    add_comment_indexes
  end

  def add_comment_fields(table)
    table.references :community_space_post, type: :string, null: false, foreign_key: true
    table.references :parent_comment, type: :string, index: false,
                                      foreign_key: { to_table: :comments }
    table.string :author_user_id, null: false
    table.text :body, null: false
    table.datetime :archived_at
  end

  def add_comment_indexes
    add_index :comments, %i[community_space_post_id created_at]
    add_index :comments, :parent_comment_id
  end
end
