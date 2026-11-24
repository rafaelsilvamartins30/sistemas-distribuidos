# frozen_string_literal: true

# Academic entities may optionally be associated with a department.
class AcademicEntity < ApplicationRecord
  include ProtectGlobalAdministrator

  belongs_to :department, optional: true

  before_validation :assign_id, on: :create

  validates :name, :description, :general_info_markdown, :entity_type, presence: true
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
