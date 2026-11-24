# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'
require_relative '../support/social_graph_test_support'

class CommunityConversationsControllerTest < ActionDispatch::IntegrationTest
  include SocialGraphTestSupport

  test 'community followers can publish and non-followers cannot' do
    community = create_community
    publish_community_post(community, subject: 'not-following', body: 'deve ser recusado')
    assert_response :forbidden

    follow_community(community, 'follower')
    publish_community_post(community, subject: 'follower', body: 'Pode publicar')
    assert_response :created
  end

  test 'community followers can vote only once in a poll' do
    community = create_community
    follow_community(community, 'community-owner')
    follow_community(community, 'follower')
    poll_post = publish_community_poll(community)
    poll = poll_post.fetch('poll')
    assert_nil poll.fetch('totalVotes')
    assert(poll.fetch('options').all? { |option| option.fetch('votes').nil? })

    cast_poll_vote(poll.fetch('id'), poll.fetch('options').first.fetch('id'), 'follower')
    assert_response :created
    assert_equal 1, response.parsed_body.fetch('totalVotes')
    cast_poll_vote(poll.fetch('id'), poll.fetch('options').first.fetch('id'), 'follower')
    assert_response :conflict
  end

  test 'comment authors can reply and notifications point to the community' do
    community = create_community
    follow_community(community, 'community-owner')
    follow_community(community, 'follower')
    post = publish_community_post(community, subject: 'community-owner', body: 'Vamos conversar?',
                                             name: 'Marina Costa')
    assert_response :created

    parent = publish_comment(post.fetch('id'), subject: 'follower', body: 'Posso ir também?',
                                               name: 'Rafael Silva')
    assert_response :created
    assert_equal 'Rafael Silva', parent.fetch('authorName')
    assert_comment_notification(community)

    reply = publish_comment(post.fetch('id'), subject: 'community-owner', body: 'Claro!',
                                              name: 'Marina Costa', parent_comment_id: parent.fetch('id'))
    assert_response :created
    assert_equal 'Marina Costa', reply.fetch('authorName')
    assert_equal parent.fetch('id'), reply.fetch('parentCommentId')
    assert Notification.exists?(recipient_user_id: 'follower', event_type: 'COMMUNITY_SPACE_COMMENT')
    assert_equal 2, community_comments(post.fetch('id')).length
  end

  private

  def publish_community_poll(community)
    publish_community_post(
      community, subject: 'community-owner', name: 'Marina Costa', body: 'Vamos marcar o próximo encontro?',
                 poll: { question: 'Qual dia?', options: %w[Quarta Sexta] }
    )
  end

  def assert_comment_notification(community)
    notification = Notification.find_by!(recipient_user_id: 'community-owner',
                                         event_type: 'COMMUNITY_SPACE_COMMENT')
    assert_equal 'COMMUNITY', notification.resource_type
    assert_equal community.id, notification.resource_id
  end

  def community_comments(post_id)
    with_jwks { get "/community-space-posts/#{post_id}/comments", headers: bearer_headers(subject: 'follower') }
    assert_response :success
    response.parsed_body.fetch('items')
  end
end
