# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'

class SocialGraphControllerTest < ActionDispatch::IntegrationTest
  include KeycloakJwtTestHelpers

  test 'following a profile drives its current-term feed and expired posts remain in term history' do
    university = create_university
    create_post(university, term: '2026/2', body: 'Aviso atual')
    create_post(university, term: '2026/1', body: 'Aviso do semestre anterior', available_until: 1.day.ago)
    expired_current = create_post(university, term: '2026/2', body: 'Aviso expirado', available_until: 1.day.ago)

    with_jwks do
      post '/follows', params: { targetType: 'UNIVERSITY', targetId: University::SINGLETON_ID },
           headers: bearer_headers(subject: 'student'), as: :json
    end
    assert_response :created

    with_jwks { get '/feed', headers: bearer_headers(subject: 'student') }
    assert_response :success
    assert_equal ['Aviso atual'], response.parsed_body.fetch('items').map { |item| item.fetch('body') }

    with_jwks do
      post "/profiles/UNIVERSITY/#{University::SINGLETON_ID}/posts",
           params: { body: 'Aviso para outro semestre', term: '2027/1' },
           headers: bearer_headers(subject: 'university-admin'), as: :json
    end
    assert_response :created
    official_notification = Notification.find_by!(recipient_user_id: 'student', event_type: 'FOLLOWED_PROFILE_POST')
    assert_equal 'UNIVERSITY', official_notification.resource_type
    assert_equal University::SINGLETON_ID, official_notification.resource_id

    with_jwks { get "/profiles/UNIVERSITY/#{University::SINGLETON_ID}/posts?term=2026%2F1", headers: bearer_headers(subject: 'student') }
    assert_response :success
    assert_equal ['Aviso do semestre anterior'], response.parsed_body.fetch('items').map { |item| item.fetch('body') }

    with_jwks do
      get "/profiles/UNIVERSITY/#{University::SINGLETON_ID}/posts?term=2026%2F2&includeExpired=true",
          headers: bearer_headers(subject: 'student')
    end
    assert_response :success
    assert_equal ['Aviso atual', 'Aviso expirado'].sort,
                 response.parsed_body.fetch('items').map { |item| item.fetch('body') }.sort

    with_jwks do
      get "/profiles/UNIVERSITY/#{University::SINGLETON_ID}/posts?term=2026%2F2&includeExpired=perhaps",
          headers: bearer_headers(subject: 'student')
    end
    assert_response :bad_request
    assert_not expired_current.id.nil?

    with_jwks { get '/follows', headers: bearer_headers(subject: 'student') }
    assert_equal [University::SINGLETON_ID], response.parsed_body.fetch('items').map { |item| item.fetch('targetId') }
  end

  test 'community followers can post, vote once, comment, and reply' do
    community = create_community
    post_id = nil
    poll_id = nil
    option_id = nil

    with_jwks do
      post "/communities/#{community.id}/space/posts", params: { body: 'deve ser recusado' },
           headers: bearer_headers(subject: 'not-following'), as: :json
    end
    assert_response :forbidden

    follow_community(community, 'community-owner')
    follow_community(community, 'follower')

    with_jwks do
      post "/communities/#{community.id}/space/posts",
           params: {
             body: 'Vamos marcar o próximo encontro?',
             poll: { question: 'Qual dia?', options: ['Quarta', 'Sexta'] }
           }, headers: bearer_headers(subject: 'community-owner'), as: :json
    end
    assert_response :created
    post_id = response.parsed_body.fetch('id')
    poll = response.parsed_body.fetch('poll')
    poll_id = poll.fetch('id')
    option_id = poll.fetch('options').first.fetch('id')

    with_jwks do
      post "/polls/#{poll_id}/votes", params: { optionId: option_id },
           headers: bearer_headers(subject: 'follower'), as: :json
    end
    assert_response :created
    with_jwks do
      post "/polls/#{poll_id}/votes", params: { optionId: option_id },
           headers: bearer_headers(subject: 'follower'), as: :json
    end
    assert_response :conflict

    with_jwks do
      post "/community-space-posts/#{post_id}/comments", params: { body: 'Posso ir também?' },
           headers: bearer_headers(subject: 'follower'), as: :json
    end
    assert_response :created
    parent_id = response.parsed_body.fetch('id')
    comment_notification = Notification.find_by!(recipient_user_id: 'community-owner', event_type: 'COMMUNITY_SPACE_COMMENT')
    assert_equal 'COMMUNITY', comment_notification.resource_type
    assert_equal community.id, comment_notification.resource_id

    with_jwks do
      post "/community-space-posts/#{post_id}/comments",
           params: { body: 'Claro!', parentCommentId: parent_id },
           headers: bearer_headers(subject: 'community-owner'), as: :json
    end
    assert_response :created
    assert_equal parent_id, response.parsed_body.fetch('parentCommentId')
    assert Notification.exists?(recipient_user_id: 'follower', event_type: 'COMMUNITY_SPACE_COMMENT')

    with_jwks { get "/community-space-posts/#{post_id}/comments", headers: bearer_headers(subject: 'follower') }
    assert_response :success
    assert_equal 2, response.parsed_body.fetch('items').length
  end

  test 'notification center only exposes records for the authenticated subject' do
    notification = Notification.create!(id: SecureRandom.uuid, recipient_user_id: 'recipient',
                                        event_type: 'REQUEST_DECIDED', title: 'Pedido analisado',
                                        message: 'Sua solicitação foi aprovada.', resource_type: 'REQUEST',
                                        resource_id: 'request-1')

    with_jwks { get '/notifications?unreadOnly=true', headers: bearer_headers(subject: 'recipient') }
    assert_response :success
    assert_equal 1, response.parsed_body.fetch('unreadCount')
    assert_equal notification.id, response.parsed_body.dig('items', 0, 'id')
    assert_not response.parsed_body.dig('items', 0).key?('actorUserId')

    with_jwks { post "/notifications/#{notification.id}/read", headers: bearer_headers(subject: 'another-user') }
    assert_response :not_found
    assert_nil notification.reload.read_at

    with_jwks { post "/notifications/#{notification.id}/read", headers: bearer_headers(subject: 'recipient') }
    assert_response :success
    assert_not_nil notification.reload.read_at
  end

  private

  def create_university
    University.create!(id: University::SINGLETON_ID, name: 'Universidade de Teste', acronym: 'UT',
                       description: 'Descrição.', general_info_markdown: 'Informações.', current_term: '2026/2',
                       links: [], administrator_user_ids: ['university-admin'])
  end

  def create_post(university, term:, body:, available_until: nil)
    FeedPost.create!(id: SecureRandom.uuid, owner_type: 'UNIVERSITY', owner_id: university.id,
                     author_user_id: 'university-admin', term: term, body: body,
                     image_urls: [], available_until: available_until)
  end

  def create_community
    Community.create!(id: SecureRandom.uuid, name: 'Comunidade de Teste', description: 'Descrição.',
                      general_info_markdown: 'Informações.', category: 'CULTURA', links: [],
                      administrator_user_ids: [])
  end

  def follow_community(community, subject)
    with_jwks do
      post '/follows', params: { targetType: 'COMMUNITY', targetId: community.id },
           headers: bearer_headers(subject: subject), as: :json
    end
    assert_response :created
  end
end
