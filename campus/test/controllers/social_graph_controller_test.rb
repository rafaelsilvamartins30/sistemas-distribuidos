# frozen_string_literal: true

require 'test_helper'
require_relative '../support/keycloak_jwt_test_helpers'
require_relative '../support/social_graph_test_support'

class SocialGraphControllerTest < ActionDispatch::IntegrationTest
  include SocialGraphTestSupport

  test 'following a profile drives its current-term feed and selected term history includes expired posts' do
    university = create_university
    create_post(university, term: '2026/2', body: 'Aviso atual')
    expired = create_post(university, term: '2026/2', body: 'Aviso expirado', available_until: 1.day.ago)
    create_post(university, term: '2026/1', body: 'Aviso do semestre anterior', available_until: 1.day.ago)

    follow_university('student')
    request_feed('student')
    assert_response :success
    assert_equal ['Aviso atual'], feed_bodies

    publish_institutional_post(term: '2027/1', body: 'Aviso para outro semestre')
    assert_official_notification('student')
    assert_equal ['Aviso do semestre anterior'], profile_post_bodies('2026/1')
    assert_equal ['Aviso atual', 'Aviso expirado'].sort,
                 profile_post_bodies('2026/2').sort
    assert_not_nil expired.id
    assert_equal [University::SINGLETON_ID], followed_targets('student')
  end

  test 'feed combines institutional posts with followed community conversations' do
    university = create_university
    community = create_community
    other_community = create_community
    create_social_feed_posts(university, community, other_community)

    follow_university('student')
    follow_community(community, 'student')
    request_feed('student', name: 'Rafael Silva')

    assert_response :success
    assert_combined_feed(response.parsed_body)
  end

  private

  def feed_bodies
    response.parsed_body.fetch('items').map { |item| item.fetch('body') }
  end

  def assert_official_notification(recipient)
    notification = Notification.find_by!(recipient_user_id: recipient, event_type: 'FOLLOWED_PROFILE_POST')
    assert_equal 'UNIVERSITY', notification.resource_type
    assert_equal University::SINGLETON_ID, notification.resource_id
  end

  def profile_post_bodies(term)
    request_profile_posts(term: term).map { |item| item.fetch('body') }
  end

  def followed_targets(subject)
    with_jwks { get '/follows', headers: bearer_headers(subject: subject) }
    response.parsed_body.fetch('items').map { |item| item.fetch('targetId') }
  end

  def create_social_feed_posts(university, community, other_community)
    now = Time.current
    create_post(university, term: '2026/2', body: 'Aviso institucional', author_user_id: 'student',
                            created_at: now - 2.minutes)
    create_community_feed_post(community, 'Conversa na comunidade', now - 1.minute)
    create_community_feed_post(other_community, 'Conversa de comunidade não seguida', now)
  end

  def create_community_feed_post(community, body, created_at)
    CommunitySpacePost.create!(id: SecureRandom.uuid, community: community, author_user_id: 'student',
                               body: body, image_urls: [], created_at: created_at)
  end

  def assert_combined_feed(feed)
    items = feed.fetch('items')
    assert_equal(['Conversa na comunidade', 'Aviso institucional'], items.map { |item| item.fetch('body') })
    assert_equal(%w[COMMUNITY_SPACE OFFICIAL], items.map { |item| item.fetch('postType') })
    assert_equal(['Rafael Silva', 'Rafael Silva'], items.map { |item| item.fetch('authorName') })
    assert_equal 2, feed.fetch('totalElements')
  end
end
