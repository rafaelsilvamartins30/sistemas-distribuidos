# frozen_string_literal: true

# Adds clearly labelled local-only spaces without treating them as UFLA records.
class LocalDemoSyntheticSeeder
  include LocalDemoSeedSupport

  ENTITY_ATTRIBUTES = {
    name: 'Clube de Jogos — Demonstração Local',
    description: 'Entidade fictícia usada somente para testar permissões e publicações no ambiente local.',
    general_info_markdown: 'Registro sintético de demonstração local. Não representa uma organização real da UFLA.',
    entity_type: 'DEMONSTRAÇÃO LOCAL', department_id: nil, links: [], administrator_user_ids: [], reference_only: false
  }.freeze

  def call
    seed_entity
    seed_communities
  end

  private

  def seed_entity
    AcademicEntity.find_or_create_by!(id: stable_id('academic-entity/demo/clube-de-jogos')) do |entity|
      entity.assign_attributes(ENTITY_ATTRIBUTES)
    end
  end

  def seed_communities
    community_records.each { |record| seed_community(*record) }
  end

  def community_records
    [
      ['estudo-coletivo', 'Estudo Coletivo', 'Grupo fictício para demonstração de estudos colaborativos.'],
      ['jogos-de-tabuleiro', 'Jogos de Tabuleiro', 'Grupo fictício para demonstração de encontros de jogos.'],
      ['tecnologia-aberta', 'Tecnologia Aberta', 'Grupo fictício para demonstração de atividades de tecnologia.'],
      ['cultura-no-campus', 'Cultura no Campus', 'Grupo fictício para demonstração de atividades culturais.'],
      ['esporte-e-bem-estar', 'Esporte e Bem-estar', 'Grupo fictício para demonstração de atividades recreativas.']
    ]
  end

  def seed_community(slug, title, description)
    Community.find_or_create_by!(id: stable_id("community/#{slug}")) do |community|
      community.name = "#{title} — Demonstração Local"
      community.description = description
      community.general_info_markdown = 'Comunidade inteiramente sintética, criada para demonstração local.'
      community.category = 'DEMONSTRAÇÃO LOCAL'
      community.links = []
      community.administrator_user_ids = []
    end
  end
end
