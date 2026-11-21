# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class NotificationsControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'notification center only exposes records for the authenticated subject' do
    notification = create_notification
    get_unread_notifications('recipient')
    assert_response :success
    assert_equal 1, response.parsed_body.fetch('unreadCount')
    assert_equal notification.id, response.parsed_body.dig('items', 0, 'id')
    assert_not response.parsed_body.dig('items', 0).key?('actorUserId')

    mark_notification_read(notification, 'another-user')
    assert_response :not_found
    assert_nil notification.reload.read_at

    mark_notification_read(notification, 'recipient')
    assert_response :success
    assert_not_nil notification.reload.read_at
  end

  private

  def create_notification
    Notification.create!(id: SecureRandom.uuid, recipient_user_id: 'recipient', event_type: 'REQUEST_DECIDED',
                         title: 'Pedido analisado', message: 'Sua solicitação foi aprovada.',
                         resource_type: 'REQUEST', resource_id: 'request-1')
  end

  def get_unread_notifications(subject)
    with_jwks { get '/notifications?unreadOnly=true', headers: bearer_headers(subject: subject) }
  end

  def mark_notification_read(notification, subject)
    with_jwks do
      post "/notifications/#{notification.id}/read", headers: bearer_headers(subject: subject)
    end
  end
end
