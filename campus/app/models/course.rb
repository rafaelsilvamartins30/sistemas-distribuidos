# frozen_string_literal: true

# A named course offered by a department. Source-only references remain unassigned.
class Course < ApplicationRecord
  belongs_to :department, optional: true

  validates :name, presence: true
  validates :department_id, presence: true, unless: :reference_only?
  validates :name, uniqueness: { scope: :department_id }, if: -> { department_id.present? }
end
