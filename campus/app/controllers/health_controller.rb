# frozen_string_literal: true

# Process and database health endpoints for orchestration and diagnostics.
class HealthController < ApplicationController
  def live
    render json: { service: 'campus', status: 'alive' }, status: :ok
  end

  def ready
    ActiveRecord::Base.connection.select_value('SELECT 1')
    render json: { service: 'campus', status: 'ready' }, status: :ok
  rescue ActiveRecord::ActiveRecordError
    render json: { service: 'campus', status: 'unavailable' }, status: :service_unavailable
  end
end
