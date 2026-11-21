# frozen_string_literal: true

# Keeps databases that ran the earlier local iteration compatible with the
# approved affiliation model without discarding existing affiliation data.
class AlignProfessorAffiliationSchema < ActiveRecord::Migration[8.1]
  def up
    add_joined_at_to_existing_affiliations
    make_legacy_id_optional_for_new_records
  end

  def down
    remove_joined_at_added_for_legacy_schema
    remove_generated_default_from_legacy_id
  end

  private

  def add_joined_at_to_existing_affiliations
    return if column_exists?(:professor_affiliations, :joined_at)

    add_column :professor_affiliations, :joined_at, :datetime
    backfill_joined_at
    change_column_null :professor_affiliations, :joined_at, false
  end

  def backfill_joined_at
    unless column_exists?(:professor_affiliations, :created_at)
      execute 'UPDATE professor_affiliations SET joined_at = CURRENT_TIMESTAMP'
      return
    end

    execute <<~SQL.squish
      UPDATE professor_affiliations
      SET joined_at = COALESCE(created_at, CURRENT_TIMESTAMP)
    SQL
  end

  def make_legacy_id_optional_for_new_records
    return unless column_exists?(:professor_affiliations, :id)
    return if professor_affiliation_id_default.present?

    # Earlier local schemas used a redundant string id as the primary key.
    # The domain key remains user_id; a generated value preserves the old
    # primary key while allowing new affiliations to omit this legacy column.
    execute <<~SQL.squish
      ALTER TABLE professor_affiliations
      ALTER COLUMN id SET DEFAULT gen_random_uuid()::text
    SQL
  end

  def remove_joined_at_added_for_legacy_schema
    return unless column_exists?(:professor_affiliations, :joined_at)
    return unless column_exists?(:professor_affiliations, :created_at)

    remove_column :professor_affiliations, :joined_at
  end

  def remove_generated_default_from_legacy_id
    return unless column_exists?(:professor_affiliations, :id)
    return unless professor_affiliation_id_default.to_s.include?('gen_random_uuid')

    execute <<~SQL.squish
      ALTER TABLE professor_affiliations
      ALTER COLUMN id DROP DEFAULT
    SQL
  end

  def professor_affiliation_id_default
    connection.columns(:professor_affiliations).find { |column| column.name == 'id' }&.default
  end
end
