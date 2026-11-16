# frozen_string_literal: true

require_relative 'boot'

require 'rails'
require 'active_record/railtie'
require 'action_controller/railtie'
require 'securerandom'

Bundler.require(*Rails.groups)

# Application namespace for Campus-owned university and community data.
module Campus
  # The Rails application that owns university and community domain data.
  class Application < Rails::Application
    config.load_defaults 8.1
    config.api_only = true
    config.secret_key_base = if Rails.env.production?
                               ENV.fetch('SECRET_KEY_BASE')
                             else
                               SecureRandom.hex(64)
                             end
  end
end
