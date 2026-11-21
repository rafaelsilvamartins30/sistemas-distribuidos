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
    render_paginated(scope) do |post|
      CampusSocialResponse.community_post(
        post, voter_id: current_subject, viewer_id: current_subject, viewer_name: current_display_name
      )
    end
  end

  def create
    community = find_community
    return unless community
    return unless authorized_to_post?(community)

    create_community_post_from_request(community)
  rescue ActiveRecord::RecordInvalid => e
    attributes = e.record.errors.attribute_names.uniq.sort.join(', ')
    render_problem(:unprocessable_entity, "Invalid post fields: #{attributes}")
  end

  private

  def find_community
    community = Community.find_by(id: params[:community_id])
    render_problem(:not_found, 'Community not found') unless community
    community
  end

  def authorized_to_post?(community)
    return true if Follow.active.exists?(user_id: current_subject, target_type: 'COMMUNITY',
                                         target_id: community.id)

    render_problem(:forbidden, 'Following the community is required to post')
    false
  end

  def publish_community_post!(community, payload)
    CommunitySpacePost.transaction do
      post = build_community_post(community, payload)
      post.save!
      persist_poll!(post, payload[:poll])
      CampusNotifications.community_post_published!(post)
      post
    end
  end

  def build_community_post(community, payload)
    community.community_space_posts.new(
      id: SecureRandom.uuid, author_user_id: current_subject, body: payload[:body],
      image_urls: payload[:image_urls], external_url: payload[:external_url],
      available_until: payload[:available_until], has_poll_payload: payload[:poll].present?
    )
  end

  def create_community_post_from_request(community)
    payload = post_payload(community: true)
    return unless payload

    render_created_community_post(publish_community_post!(community, payload))
  end

  def render_created_community_post(post)
    response = CampusSocialResponse.community_post(
      post, voter_id: current_subject, viewer_id: current_subject, viewer_name: current_display_name
    )
    render json: response, status: :created
  end
end
