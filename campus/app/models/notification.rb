# frozen_string_literal: true

# Persisted in-app notification addressed to a Keycloak subject.
class Notification < ApplicationRecord
  before_validation :assign_id, on: :create

  validates :recipient_user_id, :event_type, :title, :message, :resource_type, :resource_id, presence: true

  scope :unread, -> { where(read_at: nil) }

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end
end
