# frozen_string_literal: true

# A university term used to organize official posts and their history.
class Semester < ApplicationRecord
  belongs_to :university

  before_validation :assign_id, on: :create

  validates :name, presence: true, format: { with: /\A\d{4}\/[12]\z/ }, uniqueness: { scope: :university_id }
  validates :starts_on, :ends_on, presence: true
  validate :end_date_is_not_before_start_date

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def end_date_is_not_before_start_date
    return if starts_on.blank? || ends_on.blank? || ends_on >= starts_on

    errors.add(:ends_on, 'must be on or after the start date')
  end
end
