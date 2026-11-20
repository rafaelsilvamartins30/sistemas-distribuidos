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
    render_paginated(scope) { |comment| CampusSocialResponse.comment(comment) }
  end

  def create
    post = CommunitySpacePost.find_by(id: params[:post_id])
    return render_problem(:not_found, 'Community post not found') unless post
    return render_problem(:forbidden, 'Following the community is required to comment') unless
      Follow.active.exists?(user_id: current_subject, target_type: 'COMMUNITY', target_id: post.community_id)

    payload = request.request_parameters
    return render_problem(:bad_request, 'Invalid request body') unless payload.is_a?(Hash)
    invalid = payload.keys - %w[body parentCommentId]
    return render_problem(:bad_request, "Invalid fields: #{invalid.join(', ')}") if invalid.any?
    return render_problem(:bad_request, 'body is required') unless payload['body'].is_a?(String) && payload['body'].present?
    parent = nil
    if payload['parentCommentId'].present?
      parent = post.comments.visible.find_by(id: payload['parentCommentId'])
      return render_problem(:not_found, 'Parent comment not found') unless parent
    elsif payload.key?('parentCommentId') && !payload['parentCommentId'].nil?
      return render_problem(:bad_request, 'parentCommentId must be a string or null')
    end

    comment = post.comments.new(id: SecureRandom.uuid, parent_comment: parent,
                                author_user_id: current_subject, body: payload['body'])
    Comment.transaction do
      comment.save!
      CampusNotifications.comment_added!(comment)
    end
    render json: CampusSocialResponse.comment(comment), status: :created
  rescue ActiveRecord::RecordInvalid => error
    render_problem(:unprocessable_entity, "Invalid comment fields: #{error.record.errors.attribute_names.uniq.sort.join(', ')}")
  end
end
