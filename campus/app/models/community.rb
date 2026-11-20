# frozen_string_literal: true

# Communities may belong to a department or the university; admins are Keycloak subjects.
class Community < ApplicationRecord
  belongs_to :department, optional: true
  has_many :community_space_posts, dependent: :restrict_with_error

  before_validation :assign_id, on: :create

  validates :name, :description, :general_info_markdown, presence: true
  validate :list_fields_must_be_arrays

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def list_fields_must_be_arrays
    errors.add(:links, :invalid) unless links.is_a?(Array)
    errors.add(:administrator_user_ids, :invalid) unless administrator_user_ids.is_a?(Array)
  end
end
