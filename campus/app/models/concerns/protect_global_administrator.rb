# frozen_string_literal: true

# The seeded global administrator must remain an administrator of every
# institutional profile so the platform account can never lose its access.
module ProtectGlobalAdministrator
  extend ActiveSupport::Concern

  GLOBAL_ADMIN_REGISTRATION_CODE = 'ADMIN-0001'

  included do
    before_validation :preserve_global_administrator
  end

  private

  def preserve_global_administrator
    return unless administrator_user_ids.is_a?(Array)

    global_admin_id = UserProfile.find_by(registration_code: GLOBAL_ADMIN_REGISTRATION_CODE)&.keycloak_user_id
    return if global_admin_id.blank?

    self.administrator_user_ids = (administrator_user_ids + [global_admin_id]).uniq
  end
end
