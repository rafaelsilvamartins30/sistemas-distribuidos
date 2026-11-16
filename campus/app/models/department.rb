# frozen_string_literal: true

# Departments are scoped to the single University record; external user IDs are not foreign keys.
class Department < ApplicationRecord
  has_many :academic_entities, dependent: :restrict_with_error

  before_validation :assign_id, on: :create

  validates :name, :acronym, :description, :general_info_markdown, presence: true
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
