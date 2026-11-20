# frozen_string_literal: true

# Shared contract for the institution-owned profile pages.
module InstitutionalProfileSerialization
  private

  def institutional_profile_fields(profile)
    {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      generalInfoMarkdown: profile.general_info_markdown,
      logoUrl: profile.logo_url,
      bannerUrl: profile.banner_url,
      links: profile.links,
      viewerCanManage: Array(profile.administrator_user_ids).include?(current_subject),
      administratorUserIds: Array(profile.administrator_user_ids).include?(current_subject) ? profile.administrator_user_ids : nil
    }
  end

  def profile_payload(fields)
    payload = request.request_parameters
    return render_problem(:bad_request, 'Invalid request body') unless payload.is_a?(Hash)

    invalid = payload.keys - fields
    invalid += payload.filter_map do |key, value|
      key if fields.include?(key) && !%w[links administratorUserIds].include?(key) && value && !value.is_a?(String)
    end
    invalid << 'links' if payload.key?('links') && !payload['links'].is_a?(Array)
    invalid << 'administratorUserIds' if payload.key?('administratorUserIds') && !valid_subject_list?(payload['administratorUserIds'])
    return payload if invalid.empty?

    render_problem(:bad_request, "Invalid fields: #{invalid.uniq.sort.join(', ')}")
    nil
  end

  def valid_subject_list?(value)
    value.is_a?(Array) && value.all? { |subject| subject.is_a?(String) && subject.present? }
  end

  def assign_profile_fields(profile, payload)
    profile.assign_attributes(
      payload.slice('name', 'description', 'generalInfoMarkdown', 'logoUrl', 'bannerUrl', 'links',
                    'administratorUserIds').transform_keys do |field|
        {
          'generalInfoMarkdown' => 'general_info_markdown',
          'logoUrl' => 'logo_url',
          'bannerUrl' => 'banner_url',
          'administratorUserIds' => 'administrator_user_ids'
        }.fetch(field, field)
      end
    )
  end
end
