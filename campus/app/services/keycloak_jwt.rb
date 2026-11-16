# frozen_string_literal: true

require 'json'
require 'net/http'
require 'jwt'

# Verifies the same Keycloak issuer, signature and time claims as the Java resource server.
class KeycloakJwt
  CACHE_TTL_SECONDS = 300
  JWKS_MUTEX = Mutex.new

  class Unavailable < StandardError; end

  def self.decode(token)
    payload, = JWT.decode(token, nil, true, decode_options)
    raise JWT::DecodeError, 'Token subject is required' unless payload['sub'].is_a?(String) && payload['sub'].present?

    payload
  rescue JWT::DecodeError, JWT::JWKError
    raise
  rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, SystemCallError, Timeout::Error, JSON::ParserError => e
    raise Unavailable, e.message
  end

  def self.decode_options
    {
      algorithms: ['RS256'],
      iss: ENV.fetch('KEYCLOAK_ISSUER_URI', 'http://localhost:18081/realms/unir'),
      verify_iss: true,
      jwks: ->(options) { jwks_for(options) }
    }
  end
  private_class_method :decode_options

  def self.jwks_for(options)
    JWKS_MUTEX.synchronize do
      refresh_jwks(options) if refresh_jwks?(options)
      @jwks
    end
  end
  private_class_method :jwks_for

  def self.refresh_jwks?(options)
    now = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    expired = @jwks.nil? || now - @jwks_loaded_at >= CACHE_TTL_SECONDS
    refresh_for_unknown_key = options[:kid_not_found] &&
                              now - (@last_unknown_kid_refresh_at || 0) >= CACHE_TTL_SECONDS
    expired || refresh_for_unknown_key
  end
  private_class_method :refresh_jwks?

  def self.refresh_jwks(options)
    @jwks = fetch_jwks
    @jwks_loaded_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    @last_unknown_kid_refresh_at = @jwks_loaded_at if options[:kid_not_found]
  end
  private_class_method :refresh_jwks

  def self.fetch_jwks
    response = request_jwks(jwks_uri)
    raise Unavailable, "Keycloak returned HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

    jwks = JWT::JWK::Set.new(JSON.parse(response.body))
    jwks.select! { |key| key[:use] == 'sig' }
    jwks
  rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, SystemCallError, Timeout::Error, JSON::ParserError,
         URI::InvalidURIError => e
    raise Unavailable, e.message
  end
  private_class_method :fetch_jwks

  def self.jwks_uri
    URI(ENV.fetch('KEYCLOAK_JWK_SET_URI', 'http://localhost:18081/realms/unir/protocol/openid-connect/certs'))
  end
  private_class_method :jwks_uri

  def self.request_jwks(uri)
    Net::HTTP.start(
      uri.host,
      uri.port,
      use_ssl: uri.scheme == 'https',
      open_timeout: 2,
      read_timeout: 2
    ) { |http| http.get(uri.request_uri) }
  end
  private_class_method :request_jwks
end
