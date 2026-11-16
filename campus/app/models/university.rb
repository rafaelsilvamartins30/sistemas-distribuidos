# frozen_string_literal: true

# UNIR has one university record. Departments belong to this singleton implicitly.
class University < ApplicationRecord
  SINGLETON_ID = '00000000-0000-4000-8000-000000000001'

  before_validation :assign_singleton_id

  validates :name, :acronym, :description, :general_info_markdown, :current_term, presence: true
  validate :links_must_be_a_list

  def self.current
    find_by(id: SINGLETON_ID)
  end

  def departments
    Department.order(:name)
  end

  private

  def assign_singleton_id
    self.id = SINGLETON_ID
  end

  def links_must_be_a_list
    errors.add(:links, :invalid) unless links.is_a?(Array)
  end
end
