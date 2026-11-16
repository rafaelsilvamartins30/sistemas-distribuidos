# frozen_string_literal: true

# Profile fields owned by Campus. Keycloak remains the source of identity claims.
class UserProfile < ApplicationRecord
  USER_TYPES = %w[STUDENT PROFESSOR STAFF].freeze
  LEGACY_AFFILIATION_STATUSES = %w[STUDENT PROFESSOR ALUMNI].freeze
  ACADEMIC_LEVELS = %w[UNDERGRAD GRADUATE MASTER PHD].freeze

  before_validation :assign_id, on: :create

  validates :keycloak_user_id, presence: true, uniqueness: true, length: { maximum: 255 }
  validates :name, :registration_code, :course, :department, presence: true, length: { maximum: 255 }
  validates :registration_code, uniqueness: true
  validates :legacy_affiliation_status, inclusion: { in: LEGACY_AFFILIATION_STATUSES }
  validates :user_type, inclusion: { in: USER_TYPES }, allow_nil: true
  validates :academic_level, inclusion: { in: ACADEMIC_LEVELS }
  validate :interests_must_be_a_list_of_valid_strings

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def interests_must_be_a_list_of_valid_strings
    valid = interests.is_a?(Array) && interests.all? do |interest|
      interest.is_a?(String) && interest.present? && interest.length <= 255
    end
    return if valid

    errors.add(:interests, :invalid)
  end
end
