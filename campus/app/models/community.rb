# frozen_string_literal: true

# Communities are campus spaces; manager IDs refer to Keycloak users, not local records.
class Community < ApplicationRecord
  before_validation :assign_id, on: :create

  validates :name, :description, :general_info_markdown, presence: true
  validate :list_fields_must_be_arrays

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def list_fields_must_be_arrays
    errors.add(:links, :invalid) unless links.is_a?(Array)
    errors.add(:manager_user_ids, :invalid) unless manager_user_ids.is_a?(Array)
  end
end
