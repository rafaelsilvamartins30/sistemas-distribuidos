# frozen_string_literal: true

# An institution-level profile managed independently from departments.
class AcademicUnit < ApplicationRecord
  before_validation :assign_id, on: :create

  validates :code, :name, :description, :general_info_markdown, presence: true
  validates :code, uniqueness: true
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
