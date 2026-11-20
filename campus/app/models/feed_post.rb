# frozen_string_literal: true

# A semester-scoped publication owned by an institutional profile.
class FeedPost < ApplicationRecord
  OWNER_TYPES = %w[UNIVERSITY ACADEMIC_UNIT DEPARTMENT ACADEMIC_ENTITY COMMUNITY].freeze

  attr_accessor :has_poll_payload

  has_one :poll, dependent: :restrict_with_error
  before_validation :assign_id, on: :create

  validates :owner_type, inclusion: { in: OWNER_TYPES }
  validates :owner_id, :author_user_id, :term, presence: true
  validate :owner_must_exist
  validate :body_or_poll_required
  validate :image_urls_must_be_an_array

  scope :visible, -> { where(archived_at: nil).where('available_until IS NULL OR available_until >= ?', Time.current) }

  def owner
    InstitutionalProfileLookup.find(owner_type, owner_id)
  end

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def owner_must_exist
    errors.add(:owner_id, :invalid) unless owner_type.in?(OWNER_TYPES) && InstitutionalProfileLookup.exists?(owner_type, owner_id)
  end

  def body_or_poll_required
    errors.add(:body, :blank) if body.blank? && poll.blank? && !has_poll_payload
  end

  def image_urls_must_be_an_array
    errors.add(:image_urls, :invalid) unless image_urls.is_a?(Array)
  end
end
