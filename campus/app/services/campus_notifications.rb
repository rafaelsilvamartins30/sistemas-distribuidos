# frozen_string_literal: true

# Persists notifications in Campus so each user's notification center has one source.
class CampusNotifications
  def self.request_submitted!(request_record)
    recipients_for_request(request_record).each do |recipient|
      create_notification(
        recipient: recipient, actor: request_record.requested_by_user_id, event: 'REQUEST_SUBMITTED',
        title: 'Nova solicitação para análise', message: request_record.title,
        resource_type: 'REQUEST', resource_id: request_record.id
      )
    end
  end

  def self.request_decided!(request_record, reviewer_id)
    decision = request_record.status == InstitutionalRequest::APPROVED ? 'aprovada' : 'recusada'
    create_notification(
      recipient: request_record.requested_by_user_id, actor: reviewer_id, event: 'REQUEST_DECIDED',
      title: "Sua solicitação foi #{decision}", message: request_record.title,
      resource_type: 'REQUEST', resource_id: request_record.id
    )
  end

  def self.official_post_published!(post)
    Follow.active.where(target_type: post.owner_type, target_id: post.owner_id).distinct.pluck(:user_id)
          .reject { |recipient| recipient == post.author_user_id }.each do |recipient|
      create_notification(
        recipient: recipient, actor: post.author_user_id, event: 'FOLLOWED_PROFILE_POST',
        title: 'Nova publicação', message: post.owner.name,
        resource_type: post.owner_type, resource_id: post.owner_id
      )
    end
  end

  def self.community_post_published!(post)
    Follow.active.where(target_type: 'COMMUNITY', target_id: post.community_id).distinct.pluck(:user_id)
          .reject { |recipient| recipient == post.author_user_id }.each do |recipient|
      create_notification(
        recipient: recipient, actor: post.author_user_id, event: 'COMMUNITY_SPACE_POST',
        title: 'Nova conversa na comunidade', message: post.community.name,
        resource_type: 'COMMUNITY', resource_id: post.community_id
      )
    end
  end

  def self.comment_added!(comment)
    recipient = comment.parent_comment&.author_user_id || comment.community_space_post.author_user_id
    return if recipient == comment.author_user_id

    create_notification(
      recipient: recipient, actor: comment.author_user_id, event: 'COMMUNITY_SPACE_COMMENT',
      title: comment.parent_comment ? 'Nova resposta' : 'Novo comentário',
      message: comment.body, resource_type: 'COMMUNITY', resource_id: comment.community_space_post.community_id
    )
  end

  def self.recipients_for_request(request_record)
    return Array(request_record.target_department&.administrator_user_ids).uniq if request_record.target_department_id

    Array(University.current&.administrator_user_ids).uniq
  end
  private_class_method :recipients_for_request

  def self.create_notification(recipient:, actor:, event:, **details)
    Notification.create!(
      recipient_user_id: recipient, actor_user_id: actor, event_type: event,
      title: details.fetch(:title).truncate(255), message: details.fetch(:message).to_s.truncate(2_000),
      resource_type: details.fetch(:resource_type), resource_id: details.fetch(:resource_id)
    )
  end
  private_class_method :create_notification
end
