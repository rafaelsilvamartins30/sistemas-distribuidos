# frozen_string_literal: true

# Private in-app notification center for the authenticated Keycloak subject.
class NotificationsController < ApplicationController
  include KeycloakAuthenticated

  def index
    notifications = Notification.where(recipient_user_id: current_subject)
    notifications = notifications.unread if ActiveModel::Type::Boolean.new.cast(params[:unreadOnly])
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '20'), 10)
    return render_problem(:bad_request, 'Invalid pagination parameters') unless page >= 0 && size.between?(1, 100)

    total = notifications.count
    items = notifications.order(created_at: :desc, id: :desc).offset(page * size).limit(size).map do |item|
      notification_response(item)
    end
    render json: { items: items, page: page, size: size, totalElements: total,
                   totalPages: (total.to_f / size).ceil, unreadCount: Notification.where(recipient_user_id: current_subject).unread.count }
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
    Notification.where(recipient_user_id: current_subject, read_at: nil).update_all(read_at: Time.current)
    head :no_content
  end

  private

  def notification_response(item)
    { id: item.id, eventType: item.event_type,
      title: item.title, message: item.message, resourceType: item.resource_type,
      resourceId: item.resource_id, readAt: item.read_at, createdAt: item.created_at }
  end
end
