INSERT INTO opportunities (
    id, title, description, publisher_type, publisher_id, category, deadline,
    external_url, image_url, created_at, status
) VALUES
    (
        '10000000-0000-4000-8000-000000000101',
        'Demonstração local — Estágio em Engenharia de Software & Dados',
        'Exemplo local de estágio com atuação em serviços distribuídos e pipelines analíticos. Confira os requisitos no edital externo.',
        'DEPARTMENT', '20000000-0000-4000-8000-000000000101', 'ESTÁGIO',
        '2027-02-28T23:59:00Z', 'https://example.org/unir-demo/estagio-software', NULL,
        '2026-11-17T12:00:00Z', 'ACTIVE'
    ),
    (
        '10000000-0000-4000-8000-000000000102',
        'Demonstração local — Bolsa de iniciação científica em PLN e saúde pública',
        'Exemplo local de pesquisa sobre processamento de linguagem natural aplicado à saúde. As informações completas e a inscrição seriam publicadas no edital externo.',
        'PROFESSOR', '20000000-0000-4000-8000-000000000102', 'INICIAÇÃO CIENTÍFICA',
        '2027-03-15T23:59:00Z', 'https://example.org/unir-demo/bolsa-pln', NULL,
        '2026-11-16T12:00:00Z', 'ACTIVE'
    ),
    (
        '10000000-0000-4000-8000-000000000103',
        'Demonstração local — Projeto de pesquisa em simulação numérica',
        'Exemplo local de projeto de pesquisa em modelagem computacional e simulação. Consulte o canal externo para conhecer o processo de seleção.',
        'ACADEMIC_ENTITY', '20000000-0000-4000-8000-000000000103', 'PESQUISA',
        NULL, 'https://example.org/unir-demo/simulacao-numerica', NULL,
        '2026-11-15T12:00:00Z', 'ACTIVE'
    )
ON CONFLICT (id) DO NOTHING;
