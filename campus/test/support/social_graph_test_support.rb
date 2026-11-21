# frozen_string_literal: true

# Shared fixtures and authenticated requests for Campus social graph tests.
module SocialGraphTestSupport
  include KeycloakJwtTestHelpers

  private

  def create_university
    University.create!(id: University::SINGLETON_ID, name: 'Universidade de Teste', acronym: 'UT',
                       description: 'Descrição.', general_info_markdown: 'Informações.', current_term: '2026/2',
                       links: [], administrator_user_ids: ['university-admin'])
  end

  def create_post(university, term:, body:, **options)
    FeedPost.create!(id: SecureRandom.uuid, owner_type: 'UNIVERSITY', owner_id: university.id,
                     author_user_id: options.fetch(:author_user_id, 'university-admin'), term: term, body: body,
                     image_urls: [], available_until: options[:available_until],
                     created_at: options.fetch(:created_at, Time.current))
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

  def follow_university(subject)
    with_jwks do
      post '/follows', params: { targetType: 'UNIVERSITY', targetId: University::SINGLETON_ID },
                       headers: bearer_headers(subject: subject), as: :json
    end
    assert_response :created
  end

  def request_feed(subject, name: nil)
    headers = name ? bearer_headers(subject: subject, name: name) : bearer_headers(subject: subject)
    with_jwks { get '/feed', headers: headers }
  end

  def publish_institutional_post(term:, body:)
    with_jwks do
      post "/profiles/UNIVERSITY/#{University::SINGLETON_ID}/posts",
           params: { body: body, term: term }, headers: bearer_headers(subject: 'university-admin'), as: :json
    end
    assert_response :created
    response.parsed_body
  end

  def request_profile_posts(term:, include_expired: false)
    query = "term=#{CGI.escape(term)}"
    query += '&includeExpired=true' if include_expired
    with_jwks do
      get "/profiles/UNIVERSITY/#{University::SINGLETON_ID}/posts?#{query}",
          headers: bearer_headers(subject: 'student')
    end
    assert_response :success
    response.parsed_body.fetch('items')
  end

  def publish_community_post(community, subject:, body:, name: nil, poll: nil)
    headers = name ? bearer_headers(subject: subject, name: name) : bearer_headers(subject: subject)
    with_jwks do
      post "/communities/#{community.id}/space/posts", params: { body: body, poll: poll }.compact,
                                                       headers: headers, as: :json
    end
    response.parsed_body
  end

  def cast_poll_vote(poll_id, option_id, subject)
    with_jwks do
      post "/polls/#{poll_id}/votes", params: { optionId: option_id },
                                      headers: bearer_headers(subject: subject), as: :json
    end
  end

  def publish_comment(post_id, subject:, body:, name: nil, parent_comment_id: nil)
    headers = name ? bearer_headers(subject: subject, name: name) : bearer_headers(subject: subject)
    params = { body: body, parentCommentId: parent_comment_id }.compact
    with_jwks do
      post "/community-space-posts/#{post_id}/comments", params: params, headers: headers, as: :json
    end
    response.parsed_body
  end
end
