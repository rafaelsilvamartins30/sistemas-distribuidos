# frozen_string_literal: true

# Validates creation requests for Campus institutional profiles.
module InstitutionalRequestProfiles
  extend ActiveSupport::Concern

  PROFILE_REQUESTS = %w[COMMUNITY_CREATION ENTITY_CREATION].freeze
  PROFILE_FIELDS = %w[name description generalInfoMarkdown logoUrl bannerUrl links category entityType].freeze
  REQUIRED_PROFILE_FIELDS = %w[name description generalInfoMarkdown].freeze
  OPTIONAL_PROFILE_FIELDS = %w[logoUrl bannerUrl category entityType].freeze

  private

  def valid_envelope?(payload)
    payload.is_a?(Hash) && (payload.keys - %w[type targetDepartmentId payload]).empty? &&
      payload['type'].is_a?(String) && valid_target_department_id?(payload) && payload['payload'].is_a?(Hash)
  end

  def valid_target_department_id?(payload)
    !payload.key?('targetDepartmentId') || payload['targetDepartmentId'].nil? ||
      payload['targetDepartmentId'].is_a?(String)
  end

  def valid_profile_payload?(type, value)
    valid_profile_keys?(type, value) && required_profile_fields_valid?(value) &&
      optional_profile_fields_valid?(value) && valid_profile_links?(value) && valid_entity_type?(type, value)
  end

  def valid_profile_keys?(type, value)
    excluded = type == 'COMMUNITY_CREATION' ? %w[entityType] : %w[category]
    (value.keys - (PROFILE_FIELDS - excluded)).empty?
  end

  def required_profile_fields_valid?(value)
    REQUIRED_PROFILE_FIELDS.all? { |field| value[field].is_a?(String) && value[field].present? }
  end

  def optional_profile_fields_valid?(value)
    OPTIONAL_PROFILE_FIELDS.all? { |field| value[field].nil? || value[field].is_a?(String) }
  end

  def valid_profile_links?(value)
    !value.key?('links') || (value['links'].is_a?(Array) && value['links'].all?(String))
  end

  def valid_entity_type?(type, value)
    type != 'ENTITY_CREATION' || value['entityType'].present?
  end
end
