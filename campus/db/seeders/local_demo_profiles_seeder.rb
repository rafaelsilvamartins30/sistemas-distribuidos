# frozen_string_literal: true

# Creates the demo user profiles (1 admin, 10 verified professors, 40 students).
class LocalDemoProfilesSeeder
  include LocalDemoSeedSupport

  def initialize(accounts)
    @accounts = accounts
    @admin_sub = accounts.fetch('admin').fetch('sub')
  end

  def call
    @accounts.each do |alias_name, account|
      profile = seed_profile(account)
      seed_verified_professor(alias_name, account, profile) if professor_account?(alias_name, account)
    end
  end

  private

  def seed_profile(account)
    profile_data = account.fetch('profile')
    department = profile_department(profile_data)
    course = Course.find_by!(department: department, name: profile_data.fetch('courseName'))
    profile = UserProfile.find_or_initialize_by(id: account.fetch('profileId'))
    profile.assign_attributes(profile_attributes(account, profile_data, course, department))
    profile.save!
    profile
  end

  def profile_department(profile_data)
    stable_key = "department/#{profile_data.fetch('departmentUnitCode')}/#{profile_data.fetch('departmentCode')}"
    Department.find(stable_id(stable_key))
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

  def professor_account?(alias_name, account)
    alias_name != 'admin' && account.fetch('profile').fetch('affiliationStatus') == 'PROFESSOR'
  end

  def seed_verified_professor(alias_name, account, profile)
    create_approved_request(alias_name, account, profile, profile.department)
    create_active_affiliation(profile, profile.department)
  end

  def create_approved_request(alias_name, account, profile, department)
    request = InstitutionalRequest.find_or_initialize_by(id: stable_id("request/professor-verification/#{alias_name}"))
    request.assign_attributes(request_identity_attributes(account, profile, department).merge(review_attributes))
    request.save!
  end

  def request_identity_attributes(account, profile, department)
    {
      type: InstitutionalRequest::PROFESSOR_VERIFICATION, title: "Verificação docente — #{profile.name}",
      requested_by_user_id: account.fetch('sub'), target_department: department,
      payload_json: { identifier: profile.registration_code }, status: InstitutionalRequest::APPROVED
    }
  end

  def review_attributes
    reviewed_at = Time.utc(2026, 11, 20, 12, 0, 0)
    {
      reviewed_at: reviewed_at, reviewed_by_user_id: @admin_sub,
      created_at: Time.utc(2026, 11, 19, 12, 0, 0), updated_at: reviewed_at
    }
  end

  def create_active_affiliation(profile, department)
    affiliation = ProfessorAffiliation.find_or_initialize_by(user_id: profile.id)
    affiliation.department = department
    affiliation.status = 'ACTIVE'
    affiliation.joined_at ||= Time.utc(2026, 11, 20, 12, 0, 0)
    affiliation.save!
  end
end
