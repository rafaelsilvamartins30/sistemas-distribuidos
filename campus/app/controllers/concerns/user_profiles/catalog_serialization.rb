# frozen_string_literal: true

module UserProfiles
  # Serializes catalog identifiers and their display values on the profile API.
  module CatalogSerialization
    RESPONSE_FIELDS = {
      'registration_code' => 'institutionalId',
      'legacy_affiliation_status' => 'affiliationStatus',
      'course_id' => 'courseId',
      'department_id' => 'departmentId',
      'created_at' => 'createdAt',
      'updated_at' => 'updatedAt'
    }.freeze
    PROFILE_RESPONSE_COLUMNS = %w[
      name registration_code legacy_affiliation_status academic_level course_id department_id
      interests created_at updated_at
    ].freeze

    private

    def profile_api_fields(profile)
      fields = profile.attributes.slice(*PROFILE_RESPONSE_COLUMNS)
      fields.transform_keys! { |field| RESPONSE_FIELDS.fetch(field, field) }
      fields.delete('academic_level')
      fields['academicLevel'] = legacy_academic_level(profile.academic_level)
      fields.merge!(profile_catalog_display_fields(profile))
      fields['id'] = profile.keycloak_user_id
      fields
    end

    def profile_catalog_display_fields(profile)
      {
        'course' => catalog_course_name(profile),
        'department' => catalog_department_name(profile)
      }
    end

    def catalog_course_name(profile)
      profile.course&.name || profile.legacy_course_name || ''
    end

    def catalog_department_name(profile)
      profile.department&.name || profile.legacy_department_name || ''
    end
  end
end
