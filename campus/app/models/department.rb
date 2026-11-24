# frozen_string_literal: true

# Departments are profiles under the singleton University; external admin IDs are not foreign keys.
class Department < ApplicationRecord
  include ProtectGlobalAdministrator

  has_many :courses, dependent: :restrict_with_error
  has_many :academic_entities, dependent: :restrict_with_error
  has_many :institutional_requests,
           foreign_key: :target_department_id,
           dependent: :restrict_with_error,
           inverse_of: :target_department
  has_many :professor_affiliations, dependent: :restrict_with_error, inverse_of: :department

  before_validation :assign_id, on: :create

  validates :name, :acronym, :description, :general_info_markdown, presence: true
  validate :list_fields_must_be_arrays

  def administered_by?(user_id)
    administrator_user_ids.include?(user_id)
  end

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def list_fields_must_be_arrays
    errors.add(:links, :invalid) unless links.is_a?(Array)
    errors.add(:administrator_user_ids, :invalid) unless administrator_user_ids.is_a?(Array)
  end
end
