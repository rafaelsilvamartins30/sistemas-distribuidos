# frozen_string_literal: true

# A user's active or historical follow of an institutional profile.
class Follow < ApplicationRecord
  TARGET_TYPES = FeedPost::OWNER_TYPES

  before_validation :assign_id, on: :create
  before_validation :assign_created_at, on: :create

  validates :user_id, :target_id, presence: true
  validates :target_type, inclusion: { in: TARGET_TYPES }
  validates :target_id, uniqueness: { scope: %i[user_id target_type] }
  validate :target_must_exist

  scope :active, -> { where(unfollowed_at: nil) }

  def target
    InstitutionalProfileLookup.find(target_type, target_id)
  end

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def assign_created_at
    self.created_at ||= Time.current
  end

  def target_must_exist
    return if InstitutionalProfileLookup.exists?(target_type, target_id)

    errors.add(:target_id, :invalid)
  end
end
