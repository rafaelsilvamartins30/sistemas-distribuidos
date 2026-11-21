# frozen_string_literal: true

# Maintains a user's followed institutional profiles without exposing follower counts.
class FollowsController < ApplicationController
  include KeycloakAuthenticated

  wrap_parameters false

  def index
    follows = Follow.active.where(user_id: current_subject).order(:created_at)
    render json: { items: follows.map { |follow| follow_response(follow) } }
  end

  def create
    attributes = follow_payload
    return unless attributes

    save_follow(attributes)
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'Follow already exists')
  end

  def destroy
    follow = Follow.find_by(id: params[:id])
    return render_problem(:not_found, 'Follow not found') unless follow
    unless follow.user_id == current_subject
      return render_problem(:forbidden,
                            'A user can only remove their own follows')
    end

    follow.update!(unfollowed_at: Time.current) if follow.unfollowed_at.nil?
    head :no_content
  end

  private

  def follow_payload
    payload = request.request_parameters
    return render_problem(:bad_request, 'Invalid request body') unless payload.is_a?(Hash)
    return unless valid_follow_fields?(payload)
    return unless valid_follow_targets?(payload)

    follow_target(payload)
  end

  def valid_follow_fields?(payload)
    invalid = payload.keys - %w[targetType targetId]
    return true if invalid.empty?

    render_problem(:bad_request, "Invalid fields: #{invalid.join(', ')}")
    false
  end

  def valid_follow_targets?(payload)
    return true if payload['targetType'].is_a?(String) && payload['targetId'].is_a?(String)

    render_problem(:bad_request, 'targetType and targetId are required')
    false
  end

  def follow_target(payload)
    target_type = payload['targetType'].upcase
    return render_problem(:bad_request, 'Invalid targetType') unless target_type.in?(Follow::TARGET_TYPES)

    target_id = payload['targetId']
    return render_problem(:not_found, 'Institutional profile not found') unless
      InstitutionalProfileLookup.exists?(target_type, target_id)

    { target_type: target_type, target_id: target_id }
  end

  def save_follow(attributes)
    follow = Follow.find_or_initialize_by(user_id: current_subject, **attributes)
    is_new = follow.new_record?
    follow.unfollowed_at = nil
    return render json: follow_response(follow), status: is_new ? :created : :ok if follow.save

    render_problem(:unprocessable_entity, 'Follow is invalid')
  end

  def follow_response(follow)
    target = follow.target
    { id: follow.id, targetType: follow.target_type, targetId: follow.target_id,
      targetName: target&.name, followedAt: follow.created_at }
  end
end
