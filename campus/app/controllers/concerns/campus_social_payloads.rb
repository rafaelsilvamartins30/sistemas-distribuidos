# frozen_string_literal: true

module CampusSocialPayloads
  extend ActiveSupport::Concern

  private

  def parse_poll(value)
    return [nil, true] if value.nil?
    return [nil, false] unless value.is_a?(Hash) && (value.keys - %w[question options closesAt]).empty?
    return [nil, false] unless value['question'].is_a?(String) && value['question'].present?
    return [nil, false] unless value['options'].is_a?(Array) && value['options'].length >= 2 &&
                               value['options'].all? { |option| option.is_a?(String) && option.present? }
    return [nil, false] if value.key?('closesAt') && value['closesAt'].present? && !value['closesAt'].is_a?(String)

    closes_at = value['closesAt'].present? ? Time.zone.iso8601(value['closesAt']) : nil
    [{ question: value['question'], options: value['options'], closes_at: closes_at }, true]
  rescue ArgumentError, TypeError
    [nil, false]
  end

  def post_payload(community: false)
    payload = request.request_parameters
    allowed = %w[body imageUrls externalUrl availableUntil poll]
    allowed += ['term'] unless community
    return bad_post_payload('Invalid request body') unless payload.is_a?(Hash)
    return bad_post_payload("Invalid fields: #{(payload.keys - allowed).join(', ')}") unless
      (payload.keys - allowed).empty?
    return bad_post_payload('body must be a string') if payload.key?('body') && !payload['body'].is_a?(String)
    return bad_post_payload('imageUrls must be a list of strings') if
      payload.key?('imageUrls') && (!payload['imageUrls'].is_a?(Array) || !payload['imageUrls'].all?(String))
    return bad_post_payload('externalUrl must be a string') if
      payload.key?('externalUrl') && payload['externalUrl'].present? && !payload['externalUrl'].is_a?(String)
    return bad_post_payload('availableUntil must be an ISO-8601 timestamp') if
      payload.key?('availableUntil') && payload['availableUntil'].present? && !payload['availableUntil'].is_a?(String)

    poll, valid = parse_poll(payload['poll'])
    return bad_post_payload('Invalid poll') unless valid

    available_until = payload['availableUntil'].present? ? Time.zone.iso8601(payload['availableUntil']) : nil
    term = payload['term']
    if !community && payload.key?('term') && (!term.is_a?(String) || term.blank? || term.length > 32)
      return bad_post_payload('term must be a non-empty string of at most 32 characters')
    end
    { body: payload.fetch('body', ''), image_urls: payload.fetch('imageUrls', []),
      external_url: payload['externalUrl'], available_until: available_until,
      term: term, poll: poll }
  rescue ArgumentError, TypeError
    bad_post_payload('availableUntil must be an ISO-8601 timestamp')
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

  def render_paginated(scope, page_size: 20)
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, page_size.to_s), 10)
    return render_problem(:bad_request, 'Invalid pagination parameters') unless page >= 0 && size.between?(1, 100)

    total = scope.count
    render json: { items: scope.offset(page * size).limit(size).map { |record| yield record }, page: page, size: size,
                   totalElements: total, totalPages: (total.to_f / size).ceil }
  rescue ArgumentError, TypeError
    render_problem(:bad_request, 'Invalid pagination parameters')
  end
end
