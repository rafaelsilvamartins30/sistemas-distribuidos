# frozen_string_literal: true

# Small JSON serializers shared by the feed and community conversation APIs.
class CampusSocialResponse
  def self.profile(type, profile)
    { type: type, id: profile.id, name: profile.name }
  end

  def self.feed_post(post, voter_id: nil, viewer_id: nil, viewer_name: nil)
    owner = InstitutionalProfileLookup.find(post.owner_type, post.owner_id)
    {
      id: post.id, postType: 'OFFICIAL', owner: profile(post.owner_type, owner),
      authorName: user_name(post.author_user_id, viewer_id: viewer_id, viewer_name: viewer_name),
      term: post.term, body: post.body, imageUrls: post.image_urls, externalUrl: post.external_url,
      availableUntil: post.available_until, createdAt: post.created_at, poll: poll(post.poll, voter_id: voter_id)
    }
  end

  def self.community_post(post, voter_id: nil, viewer_id: nil, viewer_name: nil)
    {
      id: post.id, postType: 'COMMUNITY_SPACE', community: profile('COMMUNITY', post.community),
      authorName: user_name(post.author_user_id, viewer_id: viewer_id, viewer_name: viewer_name),
      body: post.body, imageUrls: post.image_urls, externalUrl: post.external_url,
      availableUntil: post.available_until, createdAt: post.created_at,
      commentsCount: post.comments.visible.count, poll: poll(post.poll, voter_id: voter_id)
    }
  end

  def self.comment(comment, viewer_id: nil, viewer_name: nil)
    {
      id: comment.id, postId: comment.community_space_post_id, parentCommentId: comment.parent_comment_id,
      authorName: user_name(comment.author_user_id, viewer_id: viewer_id, viewer_name: viewer_name),
      body: comment.body, createdAt: comment.created_at
    }
  end

  def self.poll(poll, voter_id: nil)
    return unless poll

    current_vote = poll.poll_votes.find_by(user_id: voter_id)
    counts = poll_vote_counts(poll, current_vote)
    {
      id: poll.id, question: poll.question, closesAt: poll.closes_at, closed: poll.closed?,
      myVoteOptionId: current_vote&.poll_option_id, totalVotes: counts&.values&.sum,
      options: serialize_poll_options(poll, counts)
    }
  end

  def self.poll_vote_counts(poll, current_vote)
    poll.poll_votes.group(:poll_option_id).count if current_vote || poll.closed?
  end
  private_class_method :poll_vote_counts

  def self.serialize_poll_options(poll, counts)
    poll.poll_options.map { |option| { id: option.id, text: option.text, votes: counts&.fetch(option.id, 0) } }
  end
  private_class_method :serialize_poll_options

  def self.user_name(subject, viewer_id:, viewer_name:)
    UserProfile.find_by(keycloak_user_id: subject)&.name || (viewer_name if subject == viewer_id) || 'Usuário UNIR'
  end
  private_class_method :user_name
end
