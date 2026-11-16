# frozen_string_literal: true

# Creates the academic entity and community catalog tables.
class CreateAcademicEntitiesAndCommunities < ActiveRecord::Migration[8.1]
  def change
    create_academic_entities
    create_communities
  end

  private

  def create_academic_entities
    create_table :academic_entities, id: :string do |table|
      table.string :name, null: false, limit: 255, index: true
      table.text :description, null: false
      table.text :general_info_markdown, null: false
      table.string :entity_type, null: false, limit: 255, index: true
      table.references :department, type: :string, foreign_key: true
      table.string :logo_url, :banner_url
      table.json :links, :manager_user_ids, null: false, default: []
      table.timestamps null: false
    end
  end

  def create_communities
    create_table :communities, id: :string do |table|
      table.string :name, null: false, limit: 255, index: true
      table.text :description, null: false
      table.text :general_info_markdown, null: false
      table.string :category, limit: 255, index: true
      table.string :logo_url, :banner_url
      table.json :links, :manager_user_ids, null: false, default: []
      table.timestamps null: false
    end
  end
end
