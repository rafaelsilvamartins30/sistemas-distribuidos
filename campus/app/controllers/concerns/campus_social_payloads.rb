# frozen_string_literal: true

# Validates and persists payloads shared by Campus social publication endpoints.
module CampusSocialPayloads
  extend ActiveSupport::Concern
  include CampusPagination

  private

  def parse_poll(value)
    return [nil, true] if value.nil?
    return [nil, false] unless valid_poll_payload?(value)

    closes_at = value['closesAt'].present? ? Time.zone.iso8601(value['closesAt']) : nil
    [{ question: value['question'], options: value['options'], closes_at: closes_at }, true]
  rescue ArgumentError, TypeError
    [nil, false]
  end

  def valid_poll_payload?(value)
    value.is_a?(Hash) && (value.keys - %w[question options closesAt]).empty? &&
      value['question'].is_a?(String) && value['question'].present? &&
      valid_poll_options?(value['options']) && valid_poll_closing_time?(value)
  end

  def valid_poll_options?(options)
    options.is_a?(Array) && options.length >= 2 &&
      options.all? { |option| option.is_a?(String) && option.present? }
  end

  def valid_poll_closing_time?(value)
    !value.key?('closesAt') || value['closesAt'].blank? || value['closesAt'].is_a?(String)
  end

  def post_payload(community: false)
    payload = request.request_parameters
    return bad_post_payload('Invalid request body') unless payload.is_a?(Hash)

    error = post_payload_error(payload, community)
    return bad_post_payload(error) if error

    build_post_payload(payload, community)
  end

  def build_post_payload(payload, community)
    poll, valid = parse_poll(payload['poll'])
    return bad_post_payload('Invalid poll') unless valid

    available_until = payload['availableUntil'].present? ? Time.zone.iso8601(payload['availableUntil']) : nil
    term_error = invalid_post_term(payload, community)
    return bad_post_payload(term_error) if term_error

    post_payload_attributes(payload, available_until, poll)
  rescue ArgumentError, TypeError
    bad_post_payload('availableUntil must be an ISO-8601 timestamp')
  end

  def post_payload_error(payload, community)
    [invalid_post_fields(payload, community), invalid_post_body(payload), invalid_image_urls(payload),
     invalid_external_url(payload), invalid_post_deadline(payload)].compact.first
  end

  def invalid_post_fields(payload, community)
    allowed = %w[body imageUrls externalUrl availableUntil poll]
    allowed += ['term'] unless community
    invalid = payload.keys - allowed
    "Invalid fields: #{invalid.join(', ')}" if invalid.any?
  end

  def invalid_post_body(payload)
    'body must be a string' if payload.key?('body') && !payload['body'].is_a?(String)
  end

  def invalid_image_urls(payload)
    return unless payload.key?('imageUrls')
    return if payload['imageUrls'].is_a?(Array) && payload['imageUrls'].all?(String)

    'imageUrls must be a list of strings'
  end

  def invalid_external_url(payload)
    return unless payload.key?('externalUrl') && payload['externalUrl'].present?
    return if payload['externalUrl'].is_a?(String)

    'externalUrl must be a string'
  end

  def invalid_post_deadline(payload)
    return unless payload.key?('availableUntil') && payload['availableUntil'].present?
    return if payload['availableUntil'].is_a?(String)

    'availableUntil must be an ISO-8601 timestamp'
  end

  def invalid_post_term(payload, community)
    term = payload['term']
    invalid = !term.is_a?(String) || term.blank? || term.length > 32
    'term must be a non-empty string of at most 32 characters' if !community && payload.key?('term') && invalid
  end

  def post_payload_attributes(payload, available_until, poll)
    { body: payload.fetch('body', ''), image_urls: payload.fetch('imageUrls', []),
      external_url: payload['externalUrl'], available_until: available_until,
      term: payload['term'], poll: poll }
  end

  def bad_post_payload(detail)
    render_problem(:bad_request, detail)
    nil
  end

  def persist_poll!(source, poll_payload)
    return unless poll_payload

    poll = source.build_poll(question: poll_payload.fetch(:question), closes_at: poll_payload[:closes_at])
    poll.save!
    poll_payload.fetch(:options).each_with_index do |text, position|
      poll.poll_options.create!(id: SecureRandom.uuid, text: text, position: position)
    end
  end
end
