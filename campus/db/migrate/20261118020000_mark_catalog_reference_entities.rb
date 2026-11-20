# frozen_string_literal: true

# Preserves source provenance and distinguishes catalog references from verified
# active organizations without inferring current activity or department links.
class MarkCatalogReferenceEntities < ActiveRecord::Migration[8.1]
  def change
    change_table :academic_entities, bulk: true do |table|
      table.string :source_url
      table.string :source_affiliation_text
      table.boolean :reference_only, null: false, default: false
    end
  end
end
