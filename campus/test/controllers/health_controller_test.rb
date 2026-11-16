# frozen_string_literal: true

require 'test_helper'

# Exercises Campus liveness and database readiness responses.
class HealthControllerTest < ActionDispatch::IntegrationTest
  test 'liveness does not require the database' do
    get '/health/live'

    assert_response :ok
    assert_equal({ 'service' => 'campus', 'status' => 'alive' }, response.parsed_body)
  end

  test 'readiness checks the database' do
    get '/health/ready'

    assert_response :ok
    assert_equal({ 'service' => 'campus', 'status' => 'ready' }, response.parsed_body)
  end

  test 'readiness reports unavailable when the database cannot be reached' do
    connection_method = ActiveRecord::Base.method(:connection)
    connection = Object.new
    connection.define_singleton_method(:select_value) do |_query|
      raise ActiveRecord::ConnectionNotEstablished, 'database unavailable'
    end
    ActiveRecord::Base.define_singleton_method(:connection) { connection }

    get '/health/ready'

    assert_response :service_unavailable
    assert_equal({ 'service' => 'campus', 'status' => 'unavailable' }, response.parsed_body)
  ensure
    ActiveRecord::Base.define_singleton_method(:connection, connection_method) if connection_method
  end
end
