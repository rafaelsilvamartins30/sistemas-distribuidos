# frozen_string_literal: true

university = University.find_or_create_by!(id: University::SINGLETON_ID) do |record|
  record.name = 'Universidade Federal do Rio de Janeiro'
  record.acronym = 'UFRJ'
  record.description = 'Universidade Federal do Rio de Janeiro.'
  record.general_info_markdown = 'A Universidade Federal do Rio de Janeiro (UFRJ).'
  record.current_term = '2026.2'
  record.links = []
end

[
  {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Departamento de Ciência da Computação',
    acronym: 'DCC',
    description: 'Departamento de Ciência da Computação da UFRJ.',
    general_info_markdown: 'Informações gerais do Departamento de Ciência da Computação.',
    links: [],
    administrator_user_ids: []
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Departamento de Engenharia Elétrica',
    acronym: 'DEL',
    description: 'Departamento de Engenharia Elétrica da UFRJ.',
    general_info_markdown: 'Informações gerais do Departamento de Engenharia Elétrica.',
    links: [],
    administrator_user_ids: []
  }
].each do |attributes|
  Department.find_or_create_by!(id: attributes.fetch(:id)) do |department|
    department.assign_attributes(attributes.except(:id))
  end
end

AcademicEntity.find_or_create_by!(id: '10000000-0000-4000-8000-000000000101') do |entity|
  entity.name = 'Entidade de Demonstração do DCC'
  entity.description = 'Registro de demonstração local do Campus.'
  entity.general_info_markdown = 'Conteúdo local usado para demonstrar a consulta de entidades acadêmicas.'
  entity.entity_type = 'Demonstração'
  entity.department_id = '10000000-0000-4000-8000-000000000001'
  entity.links = []
  entity.manager_user_ids = []
end

Community.find_or_create_by!(id: '10000000-0000-4000-8000-000000000201') do |community|
  community.name = 'Comunidade de Demonstração'
  community.description = 'Registro de demonstração local do Campus.'
  community.general_info_markdown = 'Conteúdo local usado para demonstrar a consulta de comunidades.'
  community.links = []
  community.manager_user_ids = []
end

Rails.logger.info("Campus seed ready: #{university.acronym} (#{Department.count} departments, " \
                  "#{AcademicEntity.count} academic entities, #{Community.count} communities)")
