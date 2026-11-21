# frozen_string_literal: true

# Reads and writes comments and replies in community spaces.
class CommentsController < ApplicationController
  include KeycloakAuthenticated
  include CampusSocialPayloads

  wrap_parameters false

  def index
    post = CommunitySpacePost.find_by(id: params[:post_id])
    return render_problem(:not_found, 'Community post not found') unless post

    scope = post.comments.visible.order(:created_at, :id)
    render_paginated(scope) do |comment|
      CampusSocialResponse.comment(comment, viewer_id: current_subject, viewer_name: current_display_name)
    end
  end

  def create
    post = find_comment_post
    return unless post
    return unless authorized_to_comment?(post)

    create_comment_from_request(post)
  rescue ActiveRecord::RecordInvalid => e
    attributes = e.record.errors.attribute_names.uniq.sort.join(', ')
    render_problem(:unprocessable_entity, "Invalid comment fields: #{attributes}")
  end

  private

  def find_comment_post
    post = CommunitySpacePost.find_by(id: params[:post_id])
    render_problem(:not_found, 'Community post not found') unless post
    post
  end

  def authorized_to_comment?(post)
    return true if Follow.active.exists?(
      user_id: current_subject, target_type: 'COMMUNITY', target_id: post.community_id
    )

    render_problem(:forbidden, 'Following the community is required to comment')
    false
  end

  def comment_payload
    payload = request.request_parameters
    return render_problem(:bad_request, 'Invalid request body') unless payload.is_a?(Hash)

    invalid = payload.keys - %w[body parentCommentId]
    return render_problem(:bad_request, "Invalid fields: #{invalid.join(', ')}") if invalid.any?
    unless payload['body'].is_a?(String) && payload['body'].present?
      return render_problem(:bad_request,
                            'body is required')
    end

    payload
  end

  def comment_parent(post, payload)
    return [nil, true] unless payload.key?('parentCommentId')
    return [nil, true] if payload['parentCommentId'].nil?

    if payload['parentCommentId'].present?
      parent = post.comments.visible.find_by(id: payload['parentCommentId'])
      return [parent, true] if parent

      render_problem(:not_found, 'Parent comment not found')
    else
      render_problem(:bad_request, 'parentCommentId must be a string or null')
    end
    [nil, false]
  end

  def publish_comment!(post, payload, parent)
    comment = post.comments.new(id: SecureRandom.uuid, parent_comment: parent,
                                author_user_id: current_subject, body: payload['body'])
    Comment.transaction do
      comment.save!
      CampusNotifications.comment_added!(comment)
    end
    comment
  end

  def create_comment_from_request(post)
    payload = comment_payload
    return unless payload

    parent, valid = comment_parent(post, payload)
    return unless valid

    render_created_comment(publish_comment!(post, payload, parent))
  end

  def render_created_comment(comment)
    response = CampusSocialResponse.comment(comment, viewer_id: current_subject, viewer_name: current_display_name)
    render json: response, status: :created
  end
end
