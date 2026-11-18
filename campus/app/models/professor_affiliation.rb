# frozen_string_literal: true

# A department-confirmed affiliation; the profile's declared user type is not authorization.
class ProfessorAffiliation < ApplicationRecord
  self.primary_key = 'user_id'

  STATUSES = %w[ACTIVE ON_LEAVE INACTIVE].freeze

  belongs_to :user_profile, foreign_key: :user_id, inverse_of: :professor_affiliation
  belongs_to :department, inverse_of: :professor_affiliations

  before_validation :assign_joined_at, on: :create

  validates :status, inclusion: { in: STATUSES }
  validates :user_id, uniqueness: true

  scope :active, -> { where(status: 'ACTIVE') }

  private

  def assign_joined_at
    self.joined_at ||= Time.current
  end
end
