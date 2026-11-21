-- Realistic UFLA opportunities catalogue for local presentation (deterministic UUIDv5 IDs).
WITH demo_opportunities(id, title, description, publisher_type, publisher_id, category, deadline, external_url) AS (VALUES
    ('8ef8c0b6-b08e-52c0-89b9-bb57ce60526e', 'Estágio em Engenharia de Software Backend (Java & Go)', 'Atuação no desenvolvimento de APIs REST, mensageria com RabbitMQ e testes automatizados em projetos de parceria com o DCC/UFLA.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'ESTÁGIO', '2027-02-15T23:59:00Z', 'https://dcc.ufla.br/oportunidades/estagio-backend'),
    ('59f85ab2-f221-5e2c-8f9e-ebf427c7f80a', 'Bolsa PIBIC/CNPq — Arquitetura de Sistemas Distribuídos', 'Pesquisa aplicada em consistência eventual, padrão Outbox, Sagas coreografadas e observabilidade em clusters Kubernetes.', 'PROFESSOR', 'c74960cf-71a5-5aa1-ac00-c3bd4bfd10f0', 'PESQUISA', '2027-02-20T23:59:00Z', 'https://prp.ufla.br/editais/pibic-sistemas-distribuidos'),
    ('fce5d542-8dfe-5be1-9772-e1dc8ec33801', 'Projeto de Extensão — Inclusão Digital nas Escolas de Lavras', 'Oficinas de lógica de programação e cidadania digital ministradas por graduandos da UFLA na rede pública municipal.', 'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'EXTENSÃO', '2027-02-28T23:59:00Z', 'https://proec.ufla.br/projetos/inclusao-digital'),
    ('6c5ea764-1b47-51aa-b45e-8d23fc0c7835', 'Estágio em Ciência de Dados e IA Aplicada', 'Vaga para estudantes a partir do 4º período com interesse em Python, bancos vetoriais, RAG e análise exploratória de dados.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'ESTÁGIO', '2027-03-05T23:59:00Z', 'https://dcc.ufla.br/oportunidades/estagio-ia-dados'),
    ('1508872a-470e-5f0c-a358-e27bdc5dd33b', 'Iniciação Científica em Acessibilidade Web e UX', 'Investigação de padrões WCAG e design inclusivo para plataformas acadêmicas brasileiras com bolsa institucional.', 'PROFESSOR', 'c74960cf-71a5-5aa1-ac00-c3bd4bfd10f0', 'INICIAÇÃO CIENTÍFICA', '2027-03-12T23:59:00Z', 'https://prp.ufla.br/editais/ic-acessibilidade'),
    ('302aeaf6-73d3-509a-a579-c816b30b9ba7', 'Monitoria Remunerada — Algoritmos e Estruturas de Dados', 'Apoio a discentes em aulas práticas de laboratório, plantões de dúvidas e correção orientada de exercícios.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'EXTENSÃO', '2027-03-18T23:59:00Z', 'https://prograd.ufla.br/monitoria/dcc'),
    ('b5255249-b179-5b0e-acc0-256a811ac8d0', 'Estágio em DevOps, Docker e Kubernetes', 'Automação de pipelines CI/CD, segurança de containers e monitoramento de aplicações web em nuvem.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'ESTÁGIO', '2027-03-25T23:59:00Z', 'https://dcc.ufla.br/oportunidades/estagio-devops'),
    ('a5b8fd54-bcf6-588d-a2df-1c799ca11785', 'Pesquisa em Computação Aplicada à Agricultura Digital', 'Desenvolvimento de sensores IoT e plataformas de telemetria em parceria interdisciplinar com a ESAL/UFLA.', 'PROFESSOR', 'c74960cf-71a5-5aa1-ac00-c3bd4bfd10f0', 'PESQUISA', '2027-04-01T23:59:00Z', 'https://prp.ufla.br/editais/agricultura-digital')
)
INSERT INTO opportunities (
    id, title, description, publisher_type, publisher_id, category, deadline,
    external_url, image_url, created_at, status
)
SELECT id::UUID, title, description, publisher_type, publisher_id::UUID, category,
       deadline::TIMESTAMPTZ,
       external_url, NULL, TIMESTAMPTZ '2026-11-18 12:00:00+00', 'ACTIVE'
FROM demo_opportunities
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    deadline = EXCLUDED.deadline,
    external_url = EXCLUDED.external_url,
    status = 'ACTIVE';
