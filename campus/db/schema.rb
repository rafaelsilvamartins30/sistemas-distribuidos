# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_11_18_020000) do
  create_table "academic_entities", id: :string, force: :cascade do |t|
    t.string "name", limit: 255, null: false
    t.text "description", null: false
    t.text "general_info_markdown", null: false
    t.string "entity_type", limit: 255, null: false
    t.string "department_id"
    t.string "logo_url"
    t.string "banner_url"
    t.json "links", default: [], null: false
    t.json "manager_user_ids", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "source_url"
    t.string "source_affiliation_text"
    t.boolean "reference_only", default: false, null: false
    t.index ["department_id"], name: "index_academic_entities_on_department_id"
    t.index ["entity_type"], name: "index_academic_entities_on_entity_type"
    t.index ["name"], name: "index_academic_entities_on_name"
  end

  create_table "academic_units", id: :string, force: :cascade do |t|
    t.string "code", limit: 80, null: false
    t.string "name", limit: 255, null: false
    t.string "source_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["code"], name: "index_academic_units_on_code", unique: true
    t.index ["name"], name: "index_academic_units_on_name"
  end

  create_table "communities", id: :string, force: :cascade do |t|
    t.string "name", limit: 255, null: false
    t.text "description", null: false
    t.text "general_info_markdown", null: false
    t.string "category", limit: 255
    t.string "logo_url"
    t.string "banner_url"
    t.json "links", default: [], null: false
    t.json "manager_user_ids", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["category"], name: "index_communities_on_category"
    t.index ["name"], name: "index_communities_on_name"
  end

  create_table "courses", id: :string, force: :cascade do |t|
    t.string "academic_unit_id", null: false
    t.string "name", limit: 255, null: false
    t.string "source_url"
    t.text "source_note"
    t.boolean "reference_only", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["academic_unit_id", "name"], name: "index_courses_on_academic_unit_id_and_name", unique: true
    t.index ["name"], name: "index_courses_on_name"
  end

  create_table "departments", id: :string, force: :cascade do |t|
    t.string "name", limit: 255, null: false
    t.string "acronym", limit: 80, null: false
    t.text "description", null: false
    t.text "general_info_markdown", null: false
    t.string "logo_url"
    t.string "banner_url"
    t.json "links", default: [], null: false
    t.json "administrator_user_ids", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "academic_unit_id"
    t.string "source_url"
    t.index ["academic_unit_id"], name: "index_departments_on_academic_unit_id"
    t.index ["name"], name: "index_departments_on_name"
  end

  create_table "professor_affiliations", id: false, force: :cascade do |t|
    t.string "user_id", null: false
    t.string "department_id", null: false
    t.datetime "joined_at", null: false
    t.string "status", limit: 32, null: false
    t.index ["department_id"], name: "index_professor_affiliations_on_department_id"
    t.index ["user_id"], name: "index_professor_affiliations_on_user_id", unique: true
    t.check_constraint "status IN ('ACTIVE', 'ON_LEAVE', 'INACTIVE')", name: "professor_affiliations_status_check"
  end

  create_table "requests", id: :string, force: :cascade do |t|
    t.string "type", limit: 64, null: false
    t.string "title", limit: 255, null: false
    t.string "requested_by_user_id", limit: 255, null: false
    t.string "target_department_id"
    t.json "payload_json", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "status", limit: 32, null: false
    t.datetime "reviewed_at"
    t.string "reviewed_by_user_id", limit: 255
    t.index ["requested_by_user_id", "target_department_id", "type"], name: "index_requests_unique_pending_professor_verification", unique: true, where: "type = 'PROFESSOR_VERIFICATION' AND status = 'PENDING'"
    t.index ["requested_by_user_id", "type", "status"], name: "index_requests_on_requested_by_user_id_and_type_and_status"
    t.index ["target_department_id"], name: "index_requests_on_target_department_id"
    t.check_constraint "status IN ('PENDING', 'APPROVED', 'REJECTED')", name: "requests_status_check"
    t.check_constraint "type IN ('PROFESSOR_VERIFICATION', 'COMMUNITY_CREATION', 'ENTITY_CREATION')", name: "requests_type_check"
  end

  create_table "universities", id: :string, force: :cascade do |t|
    t.string "name", limit: 255, null: false
    t.string "acronym", limit: 80, null: false
    t.text "description", null: false
    t.text "general_info_markdown", null: false
    t.string "current_term", limit: 32, null: false
    t.string "logo_url"
    t.string "banner_url"
    t.json "links", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "user_profiles", id: :string, force: :cascade do |t|
    t.string "keycloak_user_id", limit: 255, null: false
    t.string "name", limit: 255, null: false
    t.string "registration_code", limit: 255, null: false
    t.string "legacy_affiliation_status", limit: 20, null: false
    t.string "academic_level", limit: 20, null: false
    t.string "legacy_course_name"
    t.string "legacy_department_name"
    t.json "interests", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "user_type"
    t.string "academic_unit_id"
    t.string "course_id"
    t.string "department_id"
    t.index ["academic_unit_id"], name: "index_user_profiles_on_academic_unit_id"
    t.index ["course_id"], name: "index_user_profiles_on_course_id"
    t.index ["department_id"], name: "index_user_profiles_on_department_id"
    t.index ["keycloak_user_id"], name: "index_user_profiles_on_keycloak_user_id", unique: true
    t.index ["registration_code"], name: "index_user_profiles_on_registration_code", unique: true
    t.check_constraint "academic_level IN ('UNDERGRAD', 'GRADUATE', 'MASTER', 'PHD')", name: "user_profiles_academic_level_check"
    t.check_constraint "legacy_affiliation_status IN ('STUDENT', 'PROFESSOR', 'ALUMNI')", name: "user_profiles_legacy_affiliation_status_check"
    t.check_constraint "user_type IS NULL OR user_type IN ('STUDENT', 'PROFESSOR', 'STAFF')", name: "user_profiles_user_type_check"
  end

  add_foreign_key "academic_entities", "departments"
  add_foreign_key "courses", "academic_units"
  add_foreign_key "departments", "academic_units"
  add_foreign_key "professor_affiliations", "departments"
  add_foreign_key "professor_affiliations", "user_profiles", column: "user_id"
  add_foreign_key "requests", "departments", column: "target_department_id"
  add_foreign_key "user_profiles", "academic_units"
  add_foreign_key "user_profiles", "courses"
  add_foreign_key "user_profiles", "departments"
end
