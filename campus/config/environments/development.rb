# frozen_string_literal: true

Rails.application.configure do
  config.hosts << 'campus'
  config.enable_reloading = true
  config.eager_load = false
  config.consider_all_requests_local = true
end
