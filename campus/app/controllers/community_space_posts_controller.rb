# frozen_string_literal: true

# Provides the open discussion space for a community and its followers.
class CommunitySpacePostsController < ApplicationController
  include KeycloakAuthenticated
  include CampusSocialPayloads

  wrap_parameters false

  def index
    community = Community.find_by(id: params[:community_id])
    return render_problem(:not_found, 'Community not found') unless community

    scope = community.community_space_posts.visible.includes(:poll).order(created_at: :desc, id: :desc)
    render_paginated(scope) { |post| CampusSocialResponse.community_post(post, voter_id: current_subject) }
  end

  def create
    community = Community.find_by(id: params[:community_id])
    return render_problem(:not_found, 'Community not found') unless community
    return render_problem(:forbidden, 'Following the community is required to post') unless
      Follow.active.exists?(user_id: current_subject, target_type: 'COMMUNITY', target_id: community.id)

    payload = post_payload(community: true)
    return unless payload

    post = nil
    CommunitySpacePost.transaction do
      post = community.community_space_posts.new(
        id: SecureRandom.uuid, author_user_id: current_subject, body: payload[:body],
        image_urls: payload[:image_urls], external_url: payload[:external_url],
        available_until: payload[:available_until], has_poll_payload: payload[:poll].present?
      )
      post.save!
      persist_poll!(post, payload[:poll])
      CampusNotifications.community_post_published!(post)
    end
    render json: CampusSocialResponse.community_post(post, voter_id: current_subject), status: :created
  rescue ActiveRecord::RecordInvalid => error
    render_problem(:unprocessable_entity, "Invalid post fields: #{error.record.errors.attribute_names.uniq.sort.join(', ')}")
  end
end
