# frozen_string_literal: true

# Stores the approved professor verification flow and the resulting affiliation.
class AddProfessorAffiliationsAndVerificationRequests < ActiveRecord::Migration[8.1]
  def change
    create_professor_affiliations
    create_requests
  end

  private

  def create_professor_affiliations
    create_professor_affiliation_table
    add_professor_affiliation_constraints
  end

  def create_professor_affiliation_table
    create_table :professor_affiliations, id: false do |table|
      table.string :user_id, null: false
      table.string :department_id, null: false
      table.datetime :joined_at, null: false
      table.string :status, null: false, limit: 32
    end
  end

  def add_professor_affiliation_constraints
    add_foreign_key :professor_affiliations, :user_profiles, column: :user_id
    add_foreign_key :professor_affiliations, :departments
    add_index :professor_affiliations, :user_id, unique: true
    add_index :professor_affiliations, :department_id
    add_check_constraint :professor_affiliations,
                         "status IN ('ACTIVE', 'ON_LEAVE', 'INACTIVE')",
                         name: 'professor_affiliations_status_check'
  end

  def create_requests
    create_requests_table
    add_foreign_key :requests, :departments, column: :target_department_id
    add_index :requests, :target_department_id
    add_index :requests, %i[requested_by_user_id type status]
    add_pending_professor_request_index
    add_request_constraints
  end

  def create_requests_table
    create_table :requests, id: :string do |table|
      add_request_identity_fields(table)
      table.timestamps null: false
      add_request_decision_fields(table)
    end
  end

  def add_request_identity_fields(table)
    table.string :type, null: false, limit: 64
    table.string :title, null: false, limit: 255
    table.string :requested_by_user_id, null: false, limit: 255
    table.string :target_department_id
    table.json :payload_json, null: false, default: {}
  end

  def add_request_decision_fields(table)
    table.string :status, null: false, limit: 32
    table.datetime :reviewed_at
    table.string :reviewed_by_user_id, limit: 255
  end

  def add_pending_professor_request_index
    add_index :requests, %i[requested_by_user_id target_department_id type],
              unique: true,
              where: "type = 'PROFESSOR_VERIFICATION' AND status = 'PENDING'",
              name: 'index_requests_unique_pending_professor_verification'
  end

  def add_request_constraints
    add_check_constraint :requests,
                         "type IN ('PROFESSOR_VERIFICATION', 'COMMUNITY_CREATION', 'ENTITY_CREATION')",
                         name: 'requests_type_check'
    add_check_constraint :requests,
                         "status IN ('PENDING', 'APPROVED', 'REJECTED')",
                         name: 'requests_status_check'
  end
end
