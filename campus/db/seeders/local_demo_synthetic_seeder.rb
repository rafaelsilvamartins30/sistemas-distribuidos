# frozen_string_literal: true

# Populates realistic UFLA academic entities, communities, and initial feed posts for local presentation.
class LocalDemoSyntheticSeeder
  include LocalDemoSeedSupport

  ENTITY_ATTRIBUTES = {
    name: 'Atlética & Liga de Computação UFLA',
    description: 'Entidade estudantil dedicada a eventos de tecnologia, integração acadêmica e esportes universitários no ICET.',
    general_info_markdown: 'Organização estudantil da UFLA focada em hackathons, oficinas técnicas, ligas esportivas e acolhimento de calouros.',
    entity_type: 'ENTIDADE ESTUDANTIL', department_id: nil, links: [], administrator_user_ids: [], reference_only: false
  }.freeze

  def call
    seed_entity
    seed_communities
    seed_feed_posts
  end

  private

  def seed_entity
    entity = AcademicEntity.find_or_initialize_by(id: stable_id('academic-entity/demo/clube-de-jogos'))
    entity.assign_attributes(ENTITY_ATTRIBUTES)
    entity.save!
  end

  def seed_communities
    community_records.each { |record| seed_community(*record) }
  end

  def community_records
    [
      ['estudo-coletivo', 'Estudos Colaborativos ICET', 'Grupos de estudo para Cálculo, Algoritmos, Sistemas Distribuídos e preparação para maratonas de programação.', 'Acadêmico'],
      ['jogos-de-tabuleiro', 'Clube de Xadrez e Jogos UFLA', 'Encontros semanais de xadrez, jogos de estratégia e torneios recreativos no Centro de Convivência.', 'Cultura & Lazer'],
      ['tecnologia-aberta', 'Comunidade Software Livre & Cloud UFLA', 'Discussões sobre Linux, Docker, Kubernetes, IA aplicada e projetos open-source no campus.', 'Tecnologia'],
      ['cultura-no-campus', 'Coletivo Cultura no Campus', 'Saraus, cinema universitário, música ao vivo e exposições artísticas abertas à comunidade.', 'Cultura'],
      ['esporte-e-bem-estar', 'Corrida & Bem-Estar UFLA', 'Treinos coletivos no campus histórico, trilhas e preparação física para as ligas universitárias.', 'Esportes']
    ]
  end

  def seed_community(slug, title, description, category)
    community = Community.find_or_initialize_by(id: stable_id("community/#{slug}"))
    community.name = title
    community.description = description
    community.general_info_markdown = "#{description}\n\nEspaço aberto para estudantes, técnicos e docentes da UFLA."
    community.category = category
    community.links = []
    community.administrator_user_ids ||= []
    community.save!
  end

  def seed_feed_posts
    university = University.current
    dcc = Department.find_by(id: stable_id('department/ICET/DCC')) || Department.first
    entity = AcademicEntity.find_by(id: stable_id('academic-entity/demo/clube-de-jogos'))
    author = UserProfile.first&.keycloak_user_id || '00000000-0000-4000-8000-000000000099'
    return unless university && defined?(FeedPost)

    posts = [
      [
        'feed-post/ufla/boas-vindas-2026', 'UNIVERSITY', university.id,
        'Bem-vindos ao novo semestre na UFLA! Confira na UNIR a agenda de eventos, editais de bolsas e campeonatos abertos para toda a comunidade acadêmica.',
        Time.utc(2026, 11, 20, 12, 0, 0)
      ],
      [
        'feed-post/dcc/semana-computacao', 'DEPARTMENT', dcc&.id,
        'Estão abertas as inscrições para o Workshop de Docker, Kubernetes e Arquitetura de Microsserviços no ICET! Garanta sua vaga na aba Eventos.',
        Time.utc(2026, 11, 20, 15, 30, 0)
      ],
      [
        'feed-post/entity/copa-futsal-2027', 'ACADEMIC_ENTITY', entity&.id,
        'A Copa UFLA de Futsal já está com equipes inscritas e tabela em andamento! Monte seu time ou entre como Free Agent direto na aba Esportes.',
        Time.utc(2026, 11, 21, 10, 0, 0)
      ]
    ]

    posts.each do |key, profile_type, profile_id, content, created_at|
      next unless profile_id

      post = FeedPost.find_or_initialize_by(id: stable_id(key))
      post.assign_attributes(
        profile_type: profile_type,
        profile_id: profile_id,
        author_user_id: author,
        content: content,
        created_at: created_at,
        updated_at: created_at
      )
      post.save!
    end
  rescue StandardError => e
    Rails.logger.warn("Skipping optional demo feed posts: #{e.message}")
  end
end
