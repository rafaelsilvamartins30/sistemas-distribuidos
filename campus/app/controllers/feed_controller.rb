# frozen_string_literal: true

# Shows current-semester official posts from profiles followed by the current user.
class FeedController < ApplicationController
  include KeycloakAuthenticated
  include CampusSocialPayloads

  def index
    term = params[:term].presence || University.current&.current_term
    return render_problem(:service_unavailable, 'University term is not configured') if term.blank?
    return render_problem(:bad_request, 'Invalid term') unless term.is_a?(String) && term.length <= 32

    follows = Follow.active.where(user_id: current_subject).pluck(:target_type, :target_id)
    scope = FeedPost.visible.where(term: term)
    unless follows.empty?
      predicate = follows.map { '(owner_type = ? AND owner_id = ?)' }.join(' OR ')
      scope = scope.where(predicate, *follows.flatten)
    else
      scope = scope.none
    end
    scope = scope.includes(:poll).order(created_at: :desc, id: :desc)
    render_paginated(scope) { |post| CampusSocialResponse.feed_post(post, voter_id: current_subject) }
  end
end
