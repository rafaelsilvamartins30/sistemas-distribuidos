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
    payload = request.request_parameters
    return render_problem(:bad_request, 'Invalid request body') unless payload.is_a?(Hash)
    return render_problem(:bad_request, "Invalid fields: #{(payload.keys - %w[targetType targetId]).join(', ')}") unless
      (payload.keys - %w[targetType targetId]).empty?
    return render_problem(:bad_request, 'targetType and targetId are required') unless
      payload['targetType'].is_a?(String) && payload['targetId'].is_a?(String)

    target_type = payload['targetType'].upcase
    target_id = payload['targetId']
    return render_problem(:bad_request, 'Invalid targetType') unless target_type.in?(Follow::TARGET_TYPES)
    return render_problem(:not_found, 'Institutional profile not found') unless
      InstitutionalProfileLookup.exists?(target_type, target_id)

    follow = Follow.find_or_initialize_by(user_id: current_subject, target_type: target_type, target_id: target_id)
    is_new = follow.new_record?
    follow.unfollowed_at = nil
    if follow.save
      return render json: follow_response(follow), status: is_new ? :created : :ok
    end

    render_problem(:unprocessable_entity, 'Follow is invalid')
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'Follow already exists')
  end

  def destroy
    follow = Follow.find_by(id: params[:id])
    return render_problem(:not_found, 'Follow not found') unless follow
    return render_problem(:forbidden, 'A user can only remove their own follows') unless follow.user_id == current_subject

    follow.update!(unfollowed_at: Time.current) if follow.unfollowed_at.nil?
    head :no_content
  end

  private

  def follow_response(follow)
    target = follow.target
    { id: follow.id, targetType: follow.target_type, targetId: follow.target_id,
      targetName: target&.name, followedAt: follow.created_at }
  end
end
