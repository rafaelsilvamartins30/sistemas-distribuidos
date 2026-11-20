# frozen_string_literal: true

# A comment or reply inside a community space post.
class Comment < ApplicationRecord
  belongs_to :community_space_post
  belongs_to :parent_comment, class_name: 'Comment', optional: true
  has_many :replies, class_name: 'Comment', foreign_key: :parent_comment_id, dependent: :restrict_with_error
  before_validation :assign_id, on: :create

  validates :author_user_id, :body, presence: true
  validate :parent_comment_must_share_post

  scope :visible, -> { where(archived_at: nil) }

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end

  def parent_comment_must_share_post
    return unless parent_comment && community_space_post_id != parent_comment.community_space_post_id

    errors.add(:parent_comment_id, :invalid)
  end
end
