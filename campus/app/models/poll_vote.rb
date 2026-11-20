# frozen_string_literal: true

class PollVote < ApplicationRecord
  belongs_to :poll
  belongs_to :poll_option
  before_validation :assign_created_at, on: :create

  validates :user_id, presence: true, uniqueness: { scope: :poll_id }
  validate :option_must_belong_to_poll

  private

  def assign_created_at
    self.created_at ||= Time.current
  end

  def option_must_belong_to_poll
    return unless poll_option && poll_id != poll_option.poll_id

    errors.add(:poll_option_id, :invalid)
  end
end
