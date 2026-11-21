# frozen_string_literal: true

# Shared contract for the institution-owned profile pages.
module InstitutionalProfileSerialization
  PROFILE_FIELD_NAMES = {
    'generalInfoMarkdown' => 'general_info_markdown',
    'logoUrl' => 'logo_url',
    'bannerUrl' => 'banner_url',
    'administratorUserIds' => 'administrator_user_ids'
  }.freeze

  private

  def institutional_profile_fields(profile)
    profile_identity(profile).merge(profile_administrator_fields(profile))
  end

  def profile_identity(profile)
    {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      generalInfoMarkdown: profile.general_info_markdown,
      logoUrl: profile.logo_url,
      bannerUrl: profile.banner_url,
      links: profile.links
    }
  end

  def profile_administrator_fields(profile)
    can_manage = Array(profile.administrator_user_ids).include?(current_subject)
    { viewerCanManage: can_manage,
      administratorUserIds: can_manage ? profile.administrator_user_ids : nil }
  end

  def profile_payload(fields)
    payload = request.request_parameters
    return render_problem(:bad_request, 'Invalid request body') unless payload.is_a?(Hash)

    invalid = invalid_profile_fields(payload, fields)
    return payload if invalid.empty?

    render_problem(:bad_request, "Invalid fields: #{invalid.uniq.sort.join(', ')}")
    nil
  end

  def invalid_profile_fields(payload, fields)
    invalid = payload.keys - fields
    invalid.concat(invalid_profile_scalar_fields(payload, fields))
    invalid.concat(invalid_profile_collection_fields(payload))
    invalid
  end

  def invalid_profile_scalar_fields(payload, fields)
    payload.filter_map do |key, value|
      key if fields.include?(key) && %w[links administratorUserIds].exclude?(key) && value && !value.is_a?(String)
    end
  end

  def invalid_profile_collection_fields(payload)
    invalid = []
    invalid << 'links' if payload.key?('links') && !payload['links'].is_a?(Array)
    if payload.key?('administratorUserIds') && !valid_subject_list?(payload['administratorUserIds'])
      invalid << 'administratorUserIds'
    end
    invalid
  end

  def valid_subject_list?(value)
    value.is_a?(Array) && value.all? { |subject| subject.is_a?(String) && subject.present? }
  end

  def assign_profile_fields(profile, payload)
    attributes = payload.slice('name', 'description', 'generalInfoMarkdown', 'logoUrl', 'bannerUrl', 'links',
                               'administratorUserIds').transform_keys do |field|
      PROFILE_FIELD_NAMES.fetch(field, field)
    end
    profile.assign_attributes(attributes)
  end
end
