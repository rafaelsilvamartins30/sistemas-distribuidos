# frozen_string_literal: true

# Creates the eight local profiles and their deliberately limited contexts.
class LocalDemoProfilesSeeder
  include LocalDemoSeedSupport

  DCC_ADMIN_ACCOUNTS = %w[unir.admin unir.departamento].freeze

  def initialize(accounts)
    @accounts = accounts
  end

  def call
    @accounts.each_value { |account| seed_profile(account) }
    seed_contextual_managers
    seed_approved_professor
  end

  private

  def seed_profile(account)
    profile_data = account.fetch('profile')
    department = profile_department(profile_data)
    course = profile_course(profile_data, department)
    UserProfile.find_or_create_by!(id: account.fetch('profileId')) do |profile|
      profile.assign_attributes(profile_attributes(account, profile_data, course, department))
    end
    verify_profile_identity(account)
  end

  def profile_department(profile_data)
    stable_key = "department/#{profile_data.fetch('departmentUnitCode')}/#{profile_data.fetch('departmentCode')}"
    Department.find(stable_id(stable_key))
  end

  def profile_course(data, department)
    id = stable_id("course/department/#{department.id}/#{data.fetch('courseName')}")
    Course.find_or_create_by!(id: id) do |course|
      course.department = department
      course.name = data.fetch('courseName')
      course.reference_only = false
    end
  end

  def profile_attributes(account, data, course, department)
    {
      keycloak_user_id: account.fetch('sub'), name: data.fetch('name'),
      registration_code: data.fetch('registrationCode'),
      legacy_affiliation_status: data.fetch('affiliationStatus'), user_type: data.fetch('affiliationStatus'),
      academic_level: data.fetch('academicLevel'), course: course,
      department: department, interests: data.fetch('interests', [])
    }
  end

  def verify_profile_identity(account)
    profile = UserProfile.find_by!(keycloak_user_id: account.fetch('sub'))
    return if profile.id == account.fetch('profileId')

    raise "Perfil local inconsistente para #{account.fetch('username')}"
  end

  def seed_contextual_managers
    university = University.current
    admin_id = @accounts.fetch('unir.admin').fetch('sub')
    university.update!(administrator_user_ids: (university.administrator_user_ids + [admin_id]).uniq)
    dcc = Department.find(stable_id('department/ICET/DCC'))
    add_department_managers(dcc)
    add_entity_manager
  end

  def add_department_managers(department)
    manager_ids = DCC_ADMIN_ACCOUNTS.map { |username| @accounts.fetch(username).fetch('sub') }
    department.update!(administrator_user_ids: (department.administrator_user_ids + manager_ids).uniq)
  end

  def add_entity_manager
    entity = AcademicEntity.find(stable_id('academic-entity/demo/clube-de-jogos'))
    manager_id = @accounts.fetch('unir.entidade').fetch('sub')
    entity.update!(administrator_user_ids: (entity.administrator_user_ids + [manager_id]).uniq)
  end

  def seed_approved_professor
    account = @accounts.fetch('unir.professor.aprovado')
    profile = UserProfile.find(account.fetch('profileId'))
    department = profile.department
    raise 'Perfil de professor aprovado precisa de departamento' unless department

    create_approved_request(account, profile, department)
    create_active_affiliation(profile, department)
  end

  def create_approved_request(account, profile, department)
    request_id = stable_id('request/professor-verification/unir.professor.aprovado')
    InstitutionalRequest.find_or_create_by!(id: request_id) do |request|
      attributes = request_identity_attributes(account, profile, department).merge(review_attributes)
      request.assign_attributes(attributes)
    end
  end

  def request_identity_attributes(account, profile, department)
    {
      type: InstitutionalRequest::PROFESSOR_VERIFICATION, title: "Verificação docente — #{profile.name}",
      requested_by_user_id: account.fetch('sub'), target_department: department,
      payload_json: { identifier: profile.registration_code }, status: InstitutionalRequest::APPROVED
    }
  end

  def review_attributes
    reviewed_at = Time.utc(2026, 11, 18, 12, 0, 0)
    {
      reviewed_at: reviewed_at, reviewed_by_user_id: @accounts.fetch('unir.admin').fetch('sub'),
      created_at: Time.utc(2026, 11, 17, 12, 0, 0), updated_at: reviewed_at
    }
  end

  def create_active_affiliation(profile, department)
    ProfessorAffiliation.find_or_create_by!(user_id: profile.id) do |affiliation|
      affiliation.department = department
      affiliation.status = 'ACTIVE'
      affiliation.joined_at = Time.utc(2026, 11, 18, 12, 0, 0)
    end
  end
end
