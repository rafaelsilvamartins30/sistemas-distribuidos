# frozen_string_literal: true

class CreateSemesters < ActiveRecord::Migration[8.1]
  def change
    create_table :semesters, id: :string do |table|
      table.references :university, type: :string, null: false, foreign_key: true
      table.string :name, null: false, limit: 6
      table.date :starts_on, null: false
      table.date :ends_on, null: false
      table.timestamps null: false
    end
    add_index :semesters, %i[university_id name], unique: true
    add_check_constraint :semesters, 'ends_on >= starts_on', name: 'semesters_date_order_check'
  end
end
