# frozen_string_literal: true

# Adds profile follows and the user notification inbox.
module CampusFollowNotificationTablesMigration
  private

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
    add_follow_constraints
  end

  def add_follow_constraints
    add_check_constraint :follows,
                         "target_type IN ('UNIVERSITY', 'ACADEMIC_UNIT', 'DEPARTMENT', 'ACADEMIC_ENTITY', 'COMMUNITY')",
                         name: 'follows_target_type_check'
    add_index :follows, %i[user_id target_type target_id], unique: true
    add_index :follows, %i[target_type target_id unfollowed_at]
  end

  def create_notifications
    create_table :notifications, id: :string do |table|
      add_notification_recipient_fields(table)
      add_notification_content_fields(table)
      table.timestamps null: false
    end
    add_notification_indexes
  end

  def add_notification_recipient_fields(table)
    table.string :recipient_user_id, null: false
    table.string :actor_user_id
    table.datetime :read_at
  end

  def add_notification_content_fields(table)
    table.string :event_type, null: false, limit: 64
    table.string :title, null: false
    table.text :message, null: false
    table.string :resource_type, null: false, limit: 64
    table.string :resource_id, null: false
  end

  def add_notification_indexes
    add_index :notifications, %i[recipient_user_id created_at]
    add_index :notifications, %i[recipient_user_id read_at created_at],
              name: 'index_notifications_on_recipient_read_created'
  end
end
