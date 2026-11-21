# frozen_string_literal: true

# User-authored post in a community's follower-only conversation space.
class CommunitySpacePost < ApplicationRecord
  attr_accessor :has_poll_payload

  belongs_to :community
  has_many :comments, dependent: :restrict_with_error
  has_one :poll, dependent: :restrict_with_error
  before_validation :assign_id, on: :create

  validates :author_user_id, presence: true
  validate :body_or_poll_required
  validate :image_urls_must_be_an_array

  scope :visible, -> { where(archived_at: nil).where('available_until IS NULL OR available_until >= ?', Time.current) }

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def image_urls_must_be_an_array
    errors.add(:image_urls, :invalid) unless image_urls.is_a?(Array)
  end

  def body_or_poll_required
    errors.add(:body, :blank) if body.blank? && poll.blank? && !has_poll_payload
  end
end
