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

    term = profile_post_term
    return unless term
    return unless valid_profile_post_term?(term)

    render_paginated(profile_post_scope(type, profile, term)) do |post|
      profile_post_response(post)
    end
  end

  def create
    type, profile = load_profile
    return unless profile

    payload, term = profile_post_submission(profile)
    return unless payload

    post = publish_profile_post!(type, profile, term, payload)
    render_created_profile_post(post)
  rescue ActiveRecord::RecordInvalid => e
    render_problem(:unprocessable_entity,
                   "Invalid post fields: #{e.record.errors.attribute_names.uniq.sort.join(', ')}")
  end

  private

  def load_profile
    type = params[:profile_type].to_s.upcase
    unless FeedPost::OWNER_TYPES.include?(type)
      render_problem(:not_found, 'Institutional profile not found')
      return [nil, nil]
    end
    return [type, University.current] if type == 'UNIVERSITY' && params[:profile_id] == University::SINGLETON_ID

    profile = InstitutionalProfileLookup.find(type, params.expect(:profile_id))
    render_problem(:not_found, 'Institutional profile not found') unless profile
    [type, profile]
  end

  def profile_post_term
    term = params[:term].presence || University.current&.current_term
    render_problem(:service_unavailable, 'University term is not configured') if term.blank?
    term.presence
  end

  def valid_profile_post_term?(term)
    unless term.is_a?(String) && term.length <= 32
      render_problem(:bad_request, 'Invalid term')
      return false
    end
    true
  end

  def profile_post_scope(type, profile, term)
    scope = FeedPost.where(owner_type: type, owner_id: profile.id, term: term, archived_at: nil)
    scope.includes(:poll).order(created_at: :desc, id: :desc)
  end

  def profile_post_response(post)
    CampusSocialResponse.feed_post(
      post, voter_id: current_subject, viewer_id: current_subject, viewer_name: current_display_name
    )
  end

  def profile_post_submission(profile)
    payload = post_payload
    return unless payload
    return unless authorize_profile_admin?(profile)

    term = payload[:term].presence || University.current&.current_term
    if term.blank?
      render_problem(:service_unavailable, 'University term is not configured')
      return
    end
    [payload, term]
  end

  def publish_profile_post!(type, profile, term, payload)
    FeedPost.transaction do
      post = build_profile_post(type, profile, term, payload)
      post.save!
      persist_poll!(post, payload[:poll])
      CampusNotifications.official_post_published!(post)
      post
    end
  end

  def build_profile_post(type, profile, term, payload)
    FeedPost.new(
      id: SecureRandom.uuid, owner_type: type, owner_id: profile.id, author_user_id: current_subject,
      term: term, body: payload[:body], image_urls: payload[:image_urls],
      external_url: payload[:external_url], available_until: payload[:available_until],
      has_poll_payload: payload[:poll].present?
    )
  end

  def render_created_profile_post(post)
    response = profile_post_response(post)
    render json: response, status: :created
  end
end
