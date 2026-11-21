# frozen_string_literal: true

# Manages official posts owned by institutional profiles.
class InstitutionalProfilePostsController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization
  include CampusSocialPayloads

  wrap_parameters false

  def index
    type, profile = load_profile
    return unless profile
    term = params[:term].presence || University.current&.current_term
    return render_problem(:service_unavailable, 'University term is not configured') if term.blank?
    return render_problem(:bad_request, 'Invalid term') unless term.is_a?(String) && term.length <= 32
    return render_problem(:bad_request, 'includeExpired must be true or false') if
      params.key?(:includeExpired) && !%w[true false].include?(params[:includeExpired])

    scope = FeedPost.where(owner_type: type, owner_id: profile.id, term: term, archived_at: nil)
    scope = scope.where('available_until IS NULL OR available_until >= ?', Time.current) if
      term == University.current&.current_term && params[:includeExpired] != 'true'
    scope = scope.includes(:poll).order(created_at: :desc, id: :desc)
    render_paginated(scope) do |post|
      CampusSocialResponse.feed_post(
        post, voter_id: current_subject, viewer_id: current_subject, viewer_name: current_display_name
      )
    end
  end

  def create
    type, profile = load_profile
    return unless profile
    payload = post_payload
    return unless payload
    return unless require_profile_admin(profile)
    term = payload[:term].presence || University.current&.current_term
    return render_problem(:service_unavailable, 'University term is not configured') if term.blank?

    post = nil
    FeedPost.transaction do
      post = FeedPost.new(
        id: SecureRandom.uuid, owner_type: type, owner_id: profile.id, author_user_id: current_subject,
        term: term, body: payload[:body], image_urls: payload[:image_urls],
        external_url: payload[:external_url], available_until: payload[:available_until],
        has_poll_payload: payload[:poll].present?
      )
      post.save!
      persist_poll!(post, payload[:poll])
      CampusNotifications.official_post_published!(post)
    end
    response = CampusSocialResponse.feed_post(
      post, voter_id: current_subject, viewer_id: current_subject, viewer_name: current_display_name
    )
    render json: response, status: :created
  rescue ActiveRecord::RecordInvalid => error
    render_problem(:unprocessable_entity, "Invalid post fields: #{error.record.errors.attribute_names.uniq.sort.join(', ')}")
  end

  private

  def load_profile
    type = params[:profile_type].to_s.upcase
    unless type.in?(FeedPost::OWNER_TYPES)
      render_problem(:not_found, 'Institutional profile not found')
      return [nil, nil]
    end
    return [type, University.current] if type == 'UNIVERSITY' && params[:profile_id] == University::SINGLETON_ID

    profile = InstitutionalProfileLookup.find(type, params[:profile_id])
    render_problem(:not_found, 'Institutional profile not found') unless profile
    [type, profile]
  end
end
