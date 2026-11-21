# frozen_string_literal: true

# Shows current-semester institutional posts and conversation posts from followed profiles.
class FeedController < ApplicationController
  include KeycloakAuthenticated
  include CampusSocialPayloads

  def index
    term = params[:term].presence || University.current&.current_term
    return render_problem(:service_unavailable, 'University term is not configured') if term.blank?
    return render_problem(:bad_request, 'Invalid term') unless valid_term?(term)

    follows = Follow.active.where(user_id: current_subject).pluck(:target_type, :target_id)
    render_combined_feed(followed_official_posts(term, follows), followed_community_posts(follows))
  end

  private

  def valid_term?(term)
    term.is_a?(String) && term.length <= 32
  end

  def followed_official_posts(term, follows)
    scope = FeedPost.visible.where(term: term)
    return scope.none if follows.empty?

    predicate = follows.map { '(owner_type = ? AND owner_id = ?)' }.join(' OR ')
    scope.where(predicate, *follows.flatten)
  end

  def followed_community_posts(follows)
    community_ids = follows.filter_map { |type, id| id if type == 'COMMUNITY' }.uniq
    CommunitySpacePost.visible.where(community_id: community_ids)
  end

  def render_combined_feed(official_scope, community_scope, page_size: 20)
    pagination = feed_pagination(page_size)
    return render_problem(:bad_request, 'Invalid pagination parameters') unless pagination

    page, size = pagination
    render json: feed_payload(official_scope, community_scope, page, size)
  end

  def feed_payload(official_scope, community_scope, page, size)
    total = official_scope.count + community_scope.count
    # Fetch enough rows from each source before merging so pagination follows one global timeline.
    candidates_per_source = (page + 1) * size
    items = merged_feed_posts(official_scope, community_scope, candidates_per_source).slice(page * size, size) || []
    serialized = items.map { |post| serialize_feed_post(post) }
    { items: serialized, page: page, size: size, totalElements: total, totalPages: (total.to_f / size).ceil }
  end

  def feed_pagination(default_size)
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, default_size.to_s), 10)
    [page, size] if page >= 0 && size.between?(1, 100)
  rescue ArgumentError, TypeError
    nil
  end

  def merged_feed_posts(official_scope, community_scope, limit)
    official = official_scope.includes(:poll).order(created_at: :desc, id: :desc).limit(limit).to_a
    community = community_scope.includes(:poll, :community).order(created_at: :desc, id: :desc).limit(limit).to_a
    (official + community).sort_by { |post| [post.created_at, post.id] }.reverse
  end

  def serialize_feed_post(post)
    identity = { voter_id: current_subject, viewer_id: current_subject, viewer_name: current_display_name }
    return CampusSocialResponse.community_post(post, **identity) if post.is_a?(CommunitySpacePost)

    CampusSocialResponse.feed_post(post, **identity)
  end
end
