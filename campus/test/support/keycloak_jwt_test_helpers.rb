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
      courseId: '20000000-0000-4000-8000-000000000002',
      departmentId: '20000000-0000-4000-8000-000000000003',
      interests: ['Sistemas distribuídos']
    }
  end

  def create_profile(subject: SUBJECT, institutional_id: '12345')
    ensure_profile_catalog!
    with_jwks do
      post '/users',
           params: valid_profile.merge(institutionalId: institutional_id),
           headers: bearer_headers(subject: subject),
           as: :json
    end
    assert_response :created
  end

  def ensure_profile_department!
    ensure_profile_catalog![:department]
  end

  def ensure_profile_catalog!
    department = ensure_profile_test_department
    course = ensure_profile_course(department)
    { course: course, department: department }
  end

  def ensure_profile_course(department)
    Course.find_or_create_by!(id: valid_profile.fetch(:courseId)) do |record|
      record.department = department
      record.name = 'Computação'
      record.source_url = 'https://example.edu.br/catalogo'
      record.source_note = 'Curso de teste.'
      record.reference_only = false
    end
  end

  def ensure_profile_test_department
    Department.find_or_create_by!(id: valid_profile.fetch(:departmentId)) do |record|
      record.name = 'Departamento de Ciência da Computação'
      record.acronym = 'DCC'
      record.description = 'Departamento de teste.'
      record.general_info_markdown = 'Informações de teste.'
      record.links = []
      record.administrator_user_ids = []
    end
  end

  def bearer_headers(subject: SUBJECT, **options)
    claims = {
      iss: options.fetch(:issuer, ISSUER), sub: subject,
      exp: options.fetch(:expires_at, 5.minutes.from_now).to_i,
      email: options.fetch(:email, 'ana@unir.br'), email_verified: true,
      name: options[:name], preferred_username: options[:preferred_username],
      realm_access: { roles: options.fetch(:roles, []) }
    }.compact
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
