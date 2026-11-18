# frozen_string_literal: true

module KeycloakJwtTestHelpers
  ISSUER = 'http://localhost:18081/realms/unir'
  SUBJECT = 'keycloak-user-123'
  PRIVATE_KEY = OpenSSL::PKey::RSA.generate(2048)
  KEY_ID = 'campus-profile-test-key'
  PUBLIC_JWKS = JWT::JWK::Set.new(JWT::JWK.new(PRIVATE_KEY.public_key, kid: KEY_ID)).export.to_json

  def setup
    super
    InstitutionalRequest.delete_all
    ProfessorAffiliation.delete_all
    UserProfile.delete_all
    ENV['KEYCLOAK_ISSUER_URI'] = ISSUER
    ENV['KEYCLOAK_JWK_SET_URI'] = 'http://keycloak.test/certs'
  end

  def valid_profile
    {
      name: 'Ana Silva',
      institutionalId: '12345',
      affiliationStatus: 'STUDENT',
      academicLevel: 'UNDERGRADUATE',
      course: 'Computação',
      department: 'Departamento de Ciência da Computação',
      interests: ['Sistemas distribuídos']
    }
  end

  def create_profile(subject: SUBJECT, institutional_id: '12345')
    ensure_profile_department!
    with_jwks do
      post '/users',
           params: valid_profile.merge(institutionalId: institutional_id),
           headers: bearer_headers(subject: subject),
           as: :json
    end
    assert_response :created
  end

  def ensure_profile_department!
    Department.find_or_create_by!(name: valid_profile.fetch(:department)) do |department|
      department.acronym = 'DCC'
      department.description = 'Departamento de teste.'
      department.general_info_markdown = 'Informações de teste.'
      department.links = []
      department.administrator_user_ids = []
    end
  end

  def bearer_headers(subject: SUBJECT, email: 'ana@unir.br', issuer: ISSUER, expires_at: 5.minutes.from_now)
    claims = { iss: issuer, sub: subject, exp: expires_at.to_i, email: email, email_verified: true }.compact
    token = JWT.encode(claims, PRIVATE_KEY, 'RS256', kid: KEY_ID)
    { 'Authorization' => "Bearer #{token}" }
  end

  def with_jwks
    state = install_test_jwks
    yield
  ensure
    restore_jwks(state)
  end

  def install_test_jwks
    singleton = KeycloakJwt.singleton_class
    original_method = singleton.instance_method(:fetch_jwks)
    original_jwks = KeycloakJwt.instance_variable_get(:@jwks)
    original_load_time = KeycloakJwt.instance_variable_get(:@jwks_loaded_at)
    singleton.send(:define_method, :fetch_jwks) { JWT::JWK::Set.new(JSON.parse(PUBLIC_JWKS)) }
    singleton.send(:private, :fetch_jwks)
    KeycloakJwt.instance_variable_set(:@jwks, nil)
    [singleton, original_method, original_jwks, original_load_time]
  end

  def restore_jwks(state)
    singleton, original_method, original_jwks, original_load_time = state
    singleton.send(:define_method, :fetch_jwks, original_method)
    singleton.send(:private, :fetch_jwks)
    KeycloakJwt.instance_variable_set(:@jwks, original_jwks)
    KeycloakJwt.instance_variable_set(:@jwks_loaded_at, original_load_time)
  end
end
