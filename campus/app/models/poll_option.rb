# frozen_string_literal: true

class PollOption < ApplicationRecord
  belongs_to :poll
  has_many :poll_votes, dependent: :restrict_with_error
  before_validation :assign_id, on: :create

  validates :text, presence: true
  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end
end
