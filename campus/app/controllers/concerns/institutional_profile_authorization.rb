# frozen_string_literal: true

# Contextual profile permissions remain owned by Campus.
module InstitutionalProfileAuthorization
  extend ActiveSupport::Concern

  private

  def require_profile_admin(profile)
    return true if profile.administrator_user_ids.include?(current_subject)

    render_problem(:forbidden, 'Administrator access to this institutional profile is required')
    false
  end

  def require_university_admin
    university = University.current
    return render_problem(:not_found, 'University not found') unless university
    return university if university.administrator_user_ids.include?(current_subject)

    render_problem(:forbidden, 'University administrator access is required')
    nil
  end

  def require_admin_list_editor(profile)
    return true if profile.administrator_user_ids.include?(current_subject)

    render_problem(:forbidden, 'Administrator access is required to change profile administrators')
    false
  end

  def require_profile_update_permissions(profile, payload)
    admin_list_changed = payload.key?('administratorUserIds')
    content_fields = payload.keys - ['administratorUserIds']
    return require_admin_list_editor(profile) if content_fields.empty?
    return false unless require_profile_admin(profile)
    return true unless admin_list_changed

    require_admin_list_editor(profile)
  end

end
