-- Synthetic opportunities for local listing and publishing demonstrations only.
-- Publisher IDs are deterministic Campus IDs: DCC, the local demo entity, and
-- the approved local professor profile. Apply after Campus seeds.
WITH demo_opportunities(id, title, description, publisher_type, publisher_id, category, deadline, external_url) AS (VALUES
    ('8ef8c0b6-b08e-52c0-89b9-bb57ce60526e', 'Demonstração local — Estágio em suporte de software', 'Vaga fictícia para testar a listagem; requisitos e candidatura aparecem somente no link de exemplo.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'ESTÁGIO', '2027-02-15T23:59:00Z', 'https://example.org/unir-demo/oportunidades/estagio-suporte'),
    ('59f85ab2-f221-5e2c-8f9e-ebf427c7f80a', 'Demonstração local — Bolsa de pesquisa em sistemas distribuídos', 'Oportunidade fictícia vinculada ao perfil de professor aprovado no ambiente local.', 'PROFESSOR', 'c74960cf-71a5-5aa1-ac00-c3bd4bfd10f0', 'PESQUISA', '2027-02-20T23:59:00Z', 'https://example.org/unir-demo/oportunidades/sistemas-distribuidos'),
    ('fce5d542-8dfe-5be1-9772-e1dc8ec33801', 'Demonstração local — Projeto de extensão em inclusão digital', 'Projeto sintético para validar publicações de uma entidade acadêmica local fictícia.', 'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'EXTENSÃO', '2027-02-28T23:59:00Z', 'https://example.org/unir-demo/oportunidades/inclusao-digital'),
    ('6c5ea764-1b47-51aa-b45e-8d23fc0c7835', 'Demonstração local — Estágio em análise de dados', 'Vaga fictícia com prazo futuro para exercitar filtros por categoria.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'ESTÁGIO', '2027-03-05T23:59:00Z', 'https://example.org/unir-demo/oportunidades/analise-dados'),
    ('1508872a-470e-5f0c-a358-e27bdc5dd33b', 'Demonstração local — Iniciação científica em acessibilidade', 'Chamada sintética de pesquisa; não corresponde a edital real.', 'PROFESSOR', 'c74960cf-71a5-5aa1-ac00-c3bd4bfd10f0', 'INICIAÇÃO CIENTÍFICA', '2027-03-12T23:59:00Z', 'https://example.org/unir-demo/oportunidades/acessibilidade'),
    ('302aeaf6-73d3-509a-a579-c816b30b9ba7', 'Demonstração local — Mutirão de dados ambientais', 'Atividade fictícia de extensão para testar publicações de entidade.', 'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'EXTENSÃO', '2027-03-18T23:59:00Z', 'https://example.org/unir-demo/oportunidades/dados-ambientais'),
    ('b5255249-b179-5b0e-acc0-256a811ac8d0', 'Demonstração local — Estágio em documentação técnica', 'Vaga sintética para exercício da busca e navegação de detalhes.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'ESTÁGIO', '2027-03-25T23:59:00Z', 'https://example.org/unir-demo/oportunidades/documentacao'),
    ('a5b8fd54-bcf6-588d-a2df-1c799ca11785', 'Demonstração local — Pesquisa em computação aplicada', 'Chamada fictícia vinculada ao perfil de professor aprovado localmente.', 'PROFESSOR', 'c74960cf-71a5-5aa1-ac00-c3bd4bfd10f0', 'PESQUISA', '2027-04-01T23:59:00Z', 'https://example.org/unir-demo/oportunidades/computacao-aplicada'),
    ('26647065-22e2-55d4-87b9-9420171ca323', 'Demonstração local — Oficina de tecnologia assistiva', 'Oportunidade fictícia de extensão para testar a listagem paginada.', 'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'EXTENSÃO', '2027-04-10T23:59:00Z', 'https://example.org/unir-demo/oportunidades/tecnologia-assistiva'),
    ('0053d296-2c2d-5b3f-b388-9f4d4b284cc4', 'Demonstração local — Estágio em qualidade de software', 'Vaga fictícia para demonstrar oportunidades de estágio.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'ESTÁGIO', '2027-04-18T23:59:00Z', 'https://example.org/unir-demo/oportunidades/qualidade'),
    ('8df423eb-0b1b-595d-94e9-6f7c3a74c49d', 'Demonstração local — Bolsa em visualização de informação', 'Chamada sintética para testar a consulta de oportunidades sem candidatura interna.', 'PROFESSOR', 'c74960cf-71a5-5aa1-ac00-c3bd4bfd10f0', 'PESQUISA', '2027-04-26T23:59:00Z', 'https://example.org/unir-demo/oportunidades/visualizacao'),
    ('0333f29b-7d32-5359-a364-9d30f4b63f22', 'Demonstração local — Ação de extensão em cultura livre', 'Anúncio fictício de extensão publicado pela entidade local de demonstração.', 'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'EXTENSÃO', '2027-05-05T23:59:00Z', 'https://example.org/unir-demo/oportunidades/cultura-livre')
)
INSERT INTO opportunities (
    id, title, description, publisher_type, publisher_id, category, deadline,
    external_url, image_url, created_at, status
)
SELECT id::UUID, title, description, publisher_type, publisher_id::UUID, category,
       deadline::TIMESTAMPTZ,
       external_url, NULL, TIMESTAMPTZ '2026-11-18 12:00:00+00', 'ACTIVE'
FROM demo_opportunities
ON CONFLICT (id) DO NOTHING;
