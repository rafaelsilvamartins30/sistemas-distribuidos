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

ActiveRecord::Schema[8.1].define(version: 2026_11_21_000000) do
  create_table "academic_entities", id: :string, force: :cascade do |t|
    t.string "name", limit: 255, null: false
    t.string "entity_type", limit: 255, null: false
    t.text "description", null: false
    t.text "general_info_markdown", null: false
    t.string "department_id"
    t.string "logo_url"
    t.string "banner_url"
    t.string "source_url"
    t.string "source_affiliation_text"
    t.json "links", default: [], null: false
    t.json "administrator_user_ids", default: [], null: false
    t.boolean "reference_only", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["department_id"], name: "index_academic_entities_on_department_id"
    t.index ["entity_type"], name: "index_academic_entities_on_entity_type"
    t.index ["name"], name: "index_academic_entities_on_name"
  end

  create_table "academic_units", id: :string, force: :cascade do |t|
    t.string "code", limit: 80, null: false
    t.string "name", limit: 255, null: false
    t.string "source_url"
    t.string "logo_url"
    t.string "banner_url"
    t.text "description", default: "", null: false
    t.text "general_info_markdown", default: "", null: false
    t.json "links", default: [], null: false
    t.json "administrator_user_ids", default: [], null: false
    t.boolean "reference_only", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["code"], name: "index_academic_units_on_code", unique: true
    t.index ["name"], name: "index_academic_units_on_name"
  end

  create_table "comments", id: :string, force: :cascade do |t|
    t.string "community_space_post_id", null: false
    t.string "parent_comment_id"
    t.string "author_user_id", null: false
    t.text "body", null: false
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["community_space_post_id", "created_at"], name: "index_comments_on_community_space_post_id_and_created_at"
    t.index ["community_space_post_id"], name: "index_comments_on_community_space_post_id"
    t.index ["parent_comment_id"], name: "index_comments_on_parent_comment_id"
  end

  create_table "communities", id: :string, force: :cascade do |t|
    t.string "name", limit: 255, null: false
    t.text "description", null: false
    t.text "general_info_markdown", null: false
    t.string "category", limit: 255
    t.string "department_id"
    t.string "logo_url"
    t.string "banner_url"
    t.json "links", default: [], null: false
    t.json "administrator_user_ids", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["category"], name: "index_communities_on_category"
    t.index ["department_id"], name: "index_communities_on_department_id"
    t.index ["name"], name: "index_communities_on_name"
  end

  create_table "community_space_posts", id: :string, force: :cascade do |t|
    t.string "community_id", null: false
    t.string "author_user_id", null: false
    t.text "body", null: false
    t.json "image_urls", default: [], null: false
    t.string "external_url"
    t.datetime "available_until"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["community_id", "created_at"], name: "index_community_space_posts_on_community_id_and_created_at"
    t.index ["community_id"], name: "index_community_space_posts_on_community_id"
  end

  create_table "courses", id: :string, force: :cascade do |t|
    t.string "name", limit: 255, null: false
    t.string "source_url"
    t.text "source_note"
    t.boolean "reference_only", default: true, null: false
    t.string "department_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["department_id", "name"], name: "index_courses_on_department_id_and_name", unique: true, where: "department_id IS NOT NULL"
    t.index ["department_id"], name: "index_courses_on_department_id"
    t.index ["name"], name: "index_courses_on_name"
  end

  create_table "departments", id: :string, force: :cascade do |t|
    t.string "name", limit: 255, null: false
    t.string "acronym", limit: 80, null: false
    t.text "description", null: false
    t.text "general_info_markdown", null: false
    t.string "logo_url"
    t.string "banner_url"
    t.string "source_url"
    t.json "links", default: [], null: false
    t.json "administrator_user_ids", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["name"], name: "index_departments_on_name"
  end

  create_table "feed_posts", id: :string, force: :cascade do |t|
    t.string "owner_type", limit: 32, null: false
    t.string "term", limit: 32, null: false
    t.string "owner_id", null: false
    t.string "author_user_id", null: false
    t.text "body", default: "", null: false
    t.json "image_urls", default: [], null: false
    t.string "external_url"
    t.datetime "available_until"
    t.datetime "archived_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["owner_type", "owner_id", "term", "created_at"], name: "index_feed_posts_on_owner_term_created"
    t.index ["term", "created_at"], name: "index_feed_posts_on_term_and_created_at"
    t.check_constraint "owner_type IN ('UNIVERSITY', 'ACADEMIC_UNIT', 'DEPARTMENT', 'ACADEMIC_ENTITY', 'COMMUNITY')", name: "feed_posts_owner_type_check"
  end

  create_table "follows", id: :string, force: :cascade do |t|
    t.string "user_id", null: false
    t.string "target_id", null: false
    t.string "target_type", limit: 32, null: false
    t.datetime "unfollowed_at"
    t.datetime "created_at", null: false
    t.index ["target_type", "target_id", "unfollowed_at"], name: "index_follows_on_target_type_and_target_id_and_unfollowed_at"
    t.index ["user_id", "target_type", "target_id"], name: "index_follows_on_user_id_and_target_type_and_target_id", unique: true
    t.check_constraint "target_type IN ('UNIVERSITY', 'ACADEMIC_UNIT', 'DEPARTMENT', 'ACADEMIC_ENTITY', 'COMMUNITY')", name: "follows_target_type_check"
  end

  create_table "notifications", id: :string, force: :cascade do |t|
    t.string "recipient_user_id", null: false
    t.string "title", null: false
    t.string "resource_id", null: false
    t.string "actor_user_id"
    t.string "event_type", limit: 64, null: false
    t.string "resource_type", limit: 64, null: false
    t.text "message", null: false
    t.datetime "read_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["recipient_user_id", "created_at"], name: "index_notifications_on_recipient_user_id_and_created_at"
    t.index ["recipient_user_id", "read_at", "created_at"], name: "index_notifications_on_recipient_read_created"
  end

  create_table "poll_options", id: :string, force: :cascade do |t|
    t.string "poll_id", null: false
    t.string "text", null: false
    t.integer "position", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["poll_id", "position"], name: "index_poll_options_on_poll_id_and_position", unique: true
    t.index ["poll_id"], name: "index_poll_options_on_poll_id"
  end

  create_table "poll_votes", id: :string, force: :cascade do |t|
    t.string "poll_id", null: false
    t.string "poll_option_id", null: false
    t.string "user_id", null: false
    t.datetime "created_at", null: false
    t.index ["poll_id", "user_id"], name: "index_poll_votes_on_poll_id_and_user_id", unique: true
    t.index ["poll_id"], name: "index_poll_votes_on_poll_id"
    t.index ["poll_option_id"], name: "index_poll_votes_on_poll_option_id"
  end

  create_table "polls", id: :string, force: :cascade do |t|
    t.string "feed_post_id"
    t.string "community_space_post_id"
    t.string "question", null: false
    t.datetime "closes_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["community_space_post_id"], name: "index_polls_on_community_space_post_id", unique: true, where: "community_space_post_id IS NOT NULL"
    t.index ["feed_post_id"], name: "index_polls_on_feed_post_id", unique: true, where: "feed_post_id IS NOT NULL"
    t.check_constraint "(feed_post_id IS NOT NULL AND community_space_post_id IS NULL) OR (feed_post_id IS NULL AND community_space_post_id IS NOT NULL)", name: "polls_single_source_check"
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
    t.string "status", limit: 32, null: false
    t.datetime "reviewed_at"
    t.string "reviewed_by_user_id", limit: 255
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["requested_by_user_id", "target_department_id", "type"], name: "index_requests_unique_pending_professor_verification", unique: true, where: "type = 'PROFESSOR_VERIFICATION' AND status = 'PENDING'"
    t.index ["requested_by_user_id", "type", "status"], name: "index_requests_on_requested_by_user_id_and_type_and_status"
    t.index ["target_department_id"], name: "index_requests_on_target_department_id"
    t.check_constraint "status IN ('PENDING', 'APPROVED', 'REJECTED')", name: "requests_status_check"
    t.check_constraint "type IN ('PROFESSOR_VERIFICATION', 'COMMUNITY_CREATION', 'ENTITY_CREATION')", name: "requests_type_check"
  end

  create_table "semesters", id: :string, force: :cascade do |t|
    t.string "university_id", null: false
    t.string "name", limit: 6, null: false
    t.date "starts_on", null: false
    t.date "ends_on", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["university_id", "name"], name: "index_semesters_on_university_id_and_name", unique: true
    t.index ["university_id"], name: "index_semesters_on_university_id"
    t.check_constraint "ends_on >= starts_on", name: "semesters_date_order_check"
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
    t.json "administrator_user_ids", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "user_profiles", id: :string, force: :cascade do |t|
    t.string "keycloak_user_id", limit: 255, null: false
    t.string "name", limit: 255, null: false
    t.string "registration_code", limit: 255, null: false
    t.string "legacy_affiliation_status", limit: 20, null: false
    t.string "academic_level", limit: 20, null: false
    t.string "user_type"
    t.string "legacy_course_name"
    t.string "legacy_department_name"
    t.json "interests", default: [], null: false
    t.string "course_id"
    t.string "department_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["course_id"], name: "index_user_profiles_on_course_id"
    t.index ["department_id"], name: "index_user_profiles_on_department_id"
    t.index ["keycloak_user_id"], name: "index_user_profiles_on_keycloak_user_id", unique: true
    t.index ["registration_code"], name: "index_user_profiles_on_registration_code", unique: true
    t.check_constraint "academic_level IN ('UNDERGRAD', 'GRADUATE', 'MASTER', 'PHD')", name: "user_profiles_academic_level_check"
    t.check_constraint "legacy_affiliation_status IN ('STUDENT', 'PROFESSOR', 'ALUMNI')", name: "user_profiles_legacy_affiliation_status_check"
    t.check_constraint "user_type IS NULL OR user_type IN ('STUDENT', 'PROFESSOR', 'STAFF')", name: "user_profiles_user_type_check"
  end

  add_foreign_key "academic_entities", "departments"
  add_foreign_key "comments", "comments", column: "parent_comment_id"
  add_foreign_key "comments", "community_space_posts"
  add_foreign_key "communities", "departments"
  add_foreign_key "community_space_posts", "communities"
  add_foreign_key "courses", "departments"
  add_foreign_key "poll_options", "polls"
  add_foreign_key "poll_votes", "poll_options"
  add_foreign_key "poll_votes", "polls"
  add_foreign_key "polls", "community_space_posts"
  add_foreign_key "polls", "feed_posts"
  add_foreign_key "professor_affiliations", "departments"
  add_foreign_key "professor_affiliations", "user_profiles", column: "user_id"
  add_foreign_key "requests", "departments", column: "target_department_id"
  add_foreign_key "semesters", "universities"
  add_foreign_key "user_profiles", "courses"
  add_foreign_key "user_profiles", "departments"
end
