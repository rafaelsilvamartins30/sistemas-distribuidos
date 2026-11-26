# frozen_string_literal: true

# Private in-app notification center for the authenticated Keycloak subject.
class NotificationsController < ApplicationController
  include KeycloakAuthenticated

  def index
    page, size = notification_page_values
    return unless page

    render json: notification_page(notification_scope, page, size)
  rescue ArgumentError, TypeError
    render_problem(:bad_request, 'Invalid pagination parameters')
  end

  def mark_read
    notification = Notification.where(recipient_user_id: current_subject).find_by(id: params[:id])
    return render_problem(:not_found, 'Notification not found') unless notification

    notification.update!(read_at: Time.current) unless notification.read_at
    render json: notification_response(notification)
  end

  def mark_all_read
    read_at = Time.current
    unread_notifications.find_each { |notification| notification.update!(read_at: read_at) }
    head :no_content
  end

  def sync_refunds
    Array(params[:items]).first(100).each { |item| sync_single_refund(item) }
    head :no_content
  end

  private

  def sync_single_refund(item)
    return unless item.respond_to?(:[])

    CampusNotifications.payment_refunded!(
      recipient: current_subject, charge_id: item[:chargeId].to_s.strip,
      amount_minor: item[:amountMinor], label: item[:label].to_s.strip.presence
    )
  end

  def notification_scope
    notifications = Notification.where(recipient_user_id: current_subject)
    ActiveModel::Type::Boolean.new.cast(params[:unreadOnly]) ? notifications.unread : notifications
  end

  def unread_notifications
    Notification.where(recipient_user_id: current_subject).unread
  end

  def notification_page_values
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '20'), 10)
    return render_problem(:bad_request, 'Invalid pagination parameters') unless page >= 0 && size.between?(1, 100)

    [page, size]
  end

  def notification_page(notifications, page, size)
    total = notifications.count
    { items: notification_items(notifications, page, size), page: page, size: size, totalElements: total,
      totalPages: (total.to_f / size).ceil, unreadCount: unread_notifications.count }
  end

  def notification_items(notifications, page, size)
    notifications.order(created_at: :desc, id: :desc).offset(page * size).limit(size).map do |item|
      notification_response(item)
    end
  end

  def notification_response(item)
    { id: item.id, eventType: item.event_type,
      title: item.title, message: item.message, resourceType: item.resource_type,
      resourceId: item.resource_id, readAt: item.read_at, createdAt: item.created_at }
  end
end
