# frozen_string_literal: true

# Resolves stable API profile types without exposing Active Record class names.
class InstitutionalProfileLookup
  TYPES = {
    'UNIVERSITY' => University,
    'ACADEMIC_UNIT' => AcademicUnit,
    'DEPARTMENT' => Department,
    'ACADEMIC_ENTITY' => AcademicEntity,
    'COMMUNITY' => Community
  }.freeze

  def self.find(type, id)
    return unless id.present?
    return University.current if type == 'UNIVERSITY' && id == University::SINGLETON_ID

    TYPES.fetch(type, nil)&.find_by(id: id)
  end

  def self.exists?(type, id)
    find(type, id).present?
  end
end
