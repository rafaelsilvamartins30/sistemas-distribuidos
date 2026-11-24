# frozen_string_literal: true

# Contextual profile permissions remain owned by Campus.
module InstitutionalProfileAuthorization
  extend ActiveSupport::Concern

  private

  def authorize_profile_admin?(profile)
    return authorize_global_university_admin? if profile.is_a?(University)
    return true if global_platform_admin?
    return true if profile.administrator_user_ids.include?(current_subject)

    render_problem(:forbidden, 'Administrator access to this institutional profile is required')
    false
  end

  def require_university_admin
    university = University.current
    return render_problem(:not_found, 'University not found') unless university
    return university if global_platform_admin?

    render_problem(:forbidden, 'Global platform administrator access is required')
    nil
  end

  def authorize_admin_list_editor?(profile)
    return authorize_global_university_admin? if profile.is_a?(University)
    return true if global_platform_admin?
    return true if profile.administrator_user_ids.include?(current_subject)

    render_problem(:forbidden, 'Administrator access is required to change profile administrators')
    false
  end

  def authorize_profile_update?(profile, payload)
    return authorize_university_update?(payload) if profile.is_a?(University)

    admin_list_changed = payload.key?('administratorUserIds')
    content_fields = payload.keys - ['administratorUserIds']
    return authorize_admin_list_editor?(profile) if content_fields.empty?
    return false unless authorize_profile_admin?(profile)

    admin_list_changed ? authorize_admin_list_editor?(profile) : true
  end

  def authorize_university_update?(payload)
    if payload.key?('administratorUserIds')
      render_problem(:bad_request, 'University administrators cannot be assigned contextually')
      return false
    end

    authorize_global_university_admin?
  end

  def authorize_global_university_admin?
    return true if global_platform_admin?

    render_problem(:forbidden, 'Global platform administrator access is required')
    false
  end
end
