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

  test 'refund notification sync creates one idempotent payment notification for the current subject' do
    payload = { items: [{ chargeId: 'charge-1', amountMinor: 2500, label: 'Mostra de automação' }] }
    2.times { sync_refunds(payload, 'buyer') }
    assert_response :no_content

    get_unread_notifications('buyer')
    assert_response :success
    assert_equal 1, response.parsed_body.fetch('unreadCount')
    item = response.parsed_body.dig('items', 0)
    assert_equal 'PAYMENT_REFUNDED', item.fetch('eventType')
    assert_equal 'PAYMENT', item.fetch('resourceType')
    assert_equal 'charge-1', item.fetch('resourceId')
    assert_equal 'Estorno concluído', item.fetch('title')
    assert_equal 'R$ 25,00 estornados · Mostra de automação', item.fetch('message')
  end

  private

  def sync_refunds(payload, subject)
    with_jwks do
      post '/internal/v1/refund-notifications', params: payload, as: :json, headers: bearer_headers(subject: subject)
    end
  end

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
