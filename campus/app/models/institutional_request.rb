# frozen_string_literal: true

# Stores only the department-reviewed professor verification request flow from Campus.
class InstitutionalRequest < ApplicationRecord
  self.table_name = 'requests'
  self.inheritance_column = :_type_disabled

  PROFESSOR_VERIFICATION = 'PROFESSOR_VERIFICATION'
  REQUEST_TYPES = [PROFESSOR_VERIFICATION, 'COMMUNITY_CREATION', 'ENTITY_CREATION'].freeze
  PENDING = 'PENDING'
  APPROVED = 'APPROVED'
  REJECTED = 'REJECTED'

  belongs_to :target_department, class_name: 'Department', optional: true, inverse_of: :institutional_requests

  before_validation :assign_id, on: :create

  validates :type, inclusion: { in: REQUEST_TYPES }
  validates :status, inclusion: { in: [PENDING, APPROVED, REJECTED] }
  validates :requested_by_user_id, :title, presence: true
  validates :payload_json, presence: true

  scope :pending, -> { where(status: PENDING) }

  def opportunity_verification_json(profile)
    {
      id: id, type: type, title: title,
      requestedByUserId: requested_by_user_id, requesterName: profile&.name,
      targetDepartmentId: target_department_id, targetDepartmentName: target_department&.name,
      payload: payload_json, status: status,
      createdAt: created_at, reviewedAt: reviewed_at, reviewedByUserId: reviewed_by_user_id
    }
  end

  private

  def assign_id
    self.id ||= SecureRandom.uuid
  end
end
