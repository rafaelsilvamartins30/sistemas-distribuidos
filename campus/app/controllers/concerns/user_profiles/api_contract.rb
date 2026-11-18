# frozen_string_literal: true

module UserProfiles
  # Keeps Campus responses compatible with the existing public profile contract.
  module ApiContract
    CREATE_FIELDS = %w[name institutionalId affiliationStatus academicLevel course department interests].freeze
    UPDATE_FIELDS = %w[name institutionalId affiliationStatus academicLevel course department interests].freeze
    STRING_FIELDS = %w[name institutionalId affiliationStatus academicLevel course department].freeze
    LEGACY_AFFILIATION_STATUSES = %w[STUDENT PROFESSOR ALUMNI].freeze
    LEGACY_ACADEMIC_LEVELS = %w[UNDERGRADUATE MASTERS DOCTORATE].freeze
    LEGACY_TO_CAMPUS_ACADEMIC_LEVEL = {
      'UNDERGRADUATE' => 'UNDERGRAD',
      'MASTERS' => 'MASTER',
      'DOCTORATE' => 'PHD'
    }.freeze
    CAMPUS_TO_LEGACY_ACADEMIC_LEVEL = LEGACY_TO_CAMPUS_ACADEMIC_LEVEL.invert.freeze
    PROFILE_FIELD_NAMES = {
      'institutionalId' => 'registration_code',
      'affiliationStatus' => 'legacy_affiliation_status',
      'academicLevel' => 'academic_level'
    }.freeze
    RESPONSE_FIELDS = {
      'registration_code' => 'institutionalId',
      'legacy_affiliation_status' => 'affiliationStatus',
      'created_at' => 'createdAt',
      'updated_at' => 'updatedAt'
    }.freeze
    PROFILE_RESPONSE_COLUMNS = %w[
      name registration_code legacy_affiliation_status academic_level course department interests created_at updated_at
    ].freeze

    private

    def load_payload(allowed_fields)
      payload = request.request_parameters
      return render_problem(:bad_request, 'Invalid request body') unless payload.is_a?(Hash)

      invalid_fields = (payload.keys - allowed_fields) + invalid_type_fields(payload) + invalid_value_fields(payload)
      return payload if invalid_fields.empty?

      render_problem(:bad_request, "Invalid fields: #{invalid_fields.uniq.sort.join(', ')}")
      nil
    end

    def invalid_type_fields(payload)
      payload.filter_map { |field, value| invalid_type(field, value) }
    end

    def invalid_value_fields(payload)
      payload.filter_map { |field, value| invalid_value(field, value) }
    end

    def invalid_type(field, value)
      return if value.nil?
      return field if STRING_FIELDS.include?(field) && !value.is_a?(String)

      field if field == 'interests' && (!value.is_a?(Array) || !value.all?(String))
    end

    def invalid_value(field, value)
      return if value.nil?
      return field if field == 'affiliationStatus' && LEGACY_AFFILIATION_STATUSES.exclude?(value)

      field if field == 'academicLevel' && LEGACY_ACADEMIC_LEVELS.exclude?(value)
    end

    def create_attributes(payload, subject)
      { keycloak_user_id: subject, name: payload['name'], **profile_attributes(payload) }
    end

    def profile_attributes(payload)
      {
        registration_code: payload['institutionalId'],
        legacy_affiliation_status: payload['affiliationStatus'],
        user_type: user_type_for(payload['affiliationStatus']),
        academic_level: LEGACY_TO_CAMPUS_ACADEMIC_LEVEL.fetch(payload['academicLevel'], payload['academicLevel']),
        course: payload['course'],
        department: payload['department'],
        interests: payload['interests'] || []
      }
    end

    def profile_update_attributes(payload)
      attributes = payload.slice(*UPDATE_FIELDS).compact.to_h do |field, value|
        [PROFILE_FIELD_NAMES.fetch(field, field), campus_value(field, value)]
      end
      if attributes.key?('legacy_affiliation_status')
        attributes['user_type'] = user_type_for(attributes['legacy_affiliation_status'])
      end
      attributes
    end

    def campus_value(field, value)
      return value unless field == 'academicLevel'

      LEGACY_TO_CAMPUS_ACADEMIC_LEVEL.fetch(value, value)
    end

    def profile_response(profile, include_token_claims: false)
      response = profile_api_fields(profile)
      response.merge!(token_api_fields) if include_token_claims
      response
    end

    def profile_api_fields(profile)
      fields = profile.attributes.slice(*PROFILE_RESPONSE_COLUMNS)
      fields.transform_keys! { |field| RESPONSE_FIELDS.fetch(field, field) }
      fields['academicLevel'] = CAMPUS_TO_LEGACY_ACADEMIC_LEVEL.fetch(fields['academic_level'])
      fields.delete('academic_level')
      fields.merge('id' => profile.keycloak_user_id)
    end

    def user_type_for(affiliation_status)
      affiliation_status if %w[STUDENT PROFESSOR].include?(affiliation_status)
    end

    def token_api_fields
      { 'email' => @token_claims['email'], 'emailVerified' => @token_claims['email_verified'] }
    end

    def render_invalid_profile(profile)
      fields = profile.errors.attribute_names.map(&:to_s).uniq.sort
      render_problem(:bad_request, "Invalid fields: #{fields.join(', ')}")
    end
  end
end
