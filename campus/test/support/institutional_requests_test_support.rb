# frozen_string_literal: true

# Shared request fixtures and authenticated calls for institutional approval tests.
module InstitutionalRequestsTestSupport
  include KeycloakJwtTestHelpers

  private

  def profile_request(type, department_id)
    payload = {
      name: 'Comunidade de Demonstração', description: 'Uma descrição de teste.',
      generalInfoMarkdown: '# Informações', links: ['https://example.edu.br'], category: 'CULTURA'
    }
    { type: type, targetDepartmentId: department_id, payload: payload }
  end

  def create_department(administrators: [])
    Department.create!(id: SecureRandom.uuid, name: 'Departamento de Teste', acronym: 'DT',
                       description: 'Descrição.', general_info_markdown: 'Informações.', links: [],
                       administrator_user_ids: administrators)
  end

  def create_university(administrators: [])
    University.create!(id: University::SINGLETON_ID, name: 'Universidade de Teste', acronym: 'UT',
                       description: 'Descrição.', general_info_markdown: 'Informações.', current_term: '2026/2',
                       links: [], administrator_user_ids: administrators)
  end

  def submit_institutional_request(body, subject:)
    with_jwks do
      post '/requests', params: body, headers: bearer_headers(subject: subject), as: :json
    end
  end

  def submit_community_request(department, subject:)
    submit_institutional_request(profile_request('COMMUNITY_CREATION', department.id), subject: subject)
    assert_response :created
    response.parsed_body.fetch('id')
  end

  def review_request(request_id, decision, subject:)
    with_jwks do
      post "/requests/#{request_id}/#{decision}", headers: bearer_headers(subject: subject)
    end
  end

  def request_pending(subject:)
    with_jwks { get '/requests/pending', headers: bearer_headers(subject: subject) }
  end

  def assert_request_is_pending(request_id, administrator)
    request_pending(subject: administrator)
    assert_response :success
    assert_equal([request_id], response.parsed_body.fetch('items').map { |item| item.fetch('id') })
  end

  def assert_community_request_approved(request_id, department)
    community = Community.sole
    assert_equal department.id, community.department_id
    assert_equal ['community-requester'], community.administrator_user_ids
    assert_equal community.id, response.parsed_body.dig('createdProfile', 'id')
    assert_equal InstitutionalRequest::APPROVED, InstitutionalRequest.find(request_id).status
    assert Notification.exists?(recipient_user_id: 'community-requester', resource_id: request_id,
                                event_type: 'REQUEST_DECIDED')
  end
end
