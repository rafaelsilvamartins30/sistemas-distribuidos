# frozen_string_literal: true

# A poll attached to one institutional post or one community space post.
class Poll < ApplicationRecord
  belongs_to :feed_post, optional: true
  belongs_to :community_space_post, optional: true
  has_many :poll_options, -> { order(:position) }, inverse_of: :poll, dependent: :restrict_with_error
  has_many :poll_votes, inverse_of: :poll, dependent: :restrict_with_error
  before_validation :assign_id, on: :create

  validates :question, presence: true
  validate :exactly_one_source

  def closed?
    closes_at.present? && closes_at <= Time.current
  end

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def exactly_one_source
    errors.add(:base, :invalid) unless [feed_post_id.present?, community_space_post_id.present?].one?
  end
end
