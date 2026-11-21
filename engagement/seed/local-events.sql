-- Realistic UFLA events catalogue for local presentation (deterministic UUIDv5 IDs).
WITH demo_events(
    id, title, description, organizer_type, organizer_id, location, starts_at, ends_at, category,
    capacity, registration_deadline, registration_mode, price, external_url, attendance_enabled, attendance_mode
) AS (VALUES
    ('ee7dfbd1-214e-55e6-8f1d-27b0b1a20131', 'Aula Magna & Boas-Vindas UFLA 2027', 'Recepção oficial aos calouros e veteranos com apresentação das entidades estudantis, laboratórios e serviços do campus.', 'UNIVERSITY', '00000000-0000-4000-8000-000000000001', 'Salão de Convenções UFLA', '2027-01-18T17:00:00Z', '2027-01-18T19:00:00Z', 'ACADEMIC', 200, '2027-01-17T23:59:00Z', 'INTERNAL_FREE', NULL, NULL, TRUE, 'PARTICIPANT_SCANS_EVENT'),
    ('e1316386-73ea-504a-8e29-f1ee2e6a9303', 'Hackathon UNIR — Sistemas Distribuídos & IA', 'Maratona prática de 24h focada em microsserviços, mensageria e aplicações de IA para o campus universitário. Inclui kit participante e coffee break.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'Auditório do ICET — Bloco 1', '2027-01-25T14:00:00Z', '2027-01-25T20:00:00Z', 'ACADEMIC', 60, '2027-01-23T23:59:00Z', 'INTERNAL_PAID', 2500, NULL, TRUE, 'ORGANIZER_SCANS_PARTICIPANT'),
    ('4bde88ca-c955-5cce-af18-caaf3e7f4691', 'Mostra de Projetos de Extensão UFLA', 'Apresentação aberta de projetos de extensão universitária em tecnologia, meio ambiente, saúde e educação.', 'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'Centro de Convivência UFLA', '2027-02-03T13:00:00Z', '2027-02-03T18:00:00Z', 'EXTENSION', 180, '2027-02-01T23:59:00Z', 'EXTERNAL_PAID', NULL, 'https://eventos.ufla.br/mostra-extensao', FALSE, NULL),
    ('cf001b74-a49e-5031-912f-8c24d4d642ff', 'Clube de Leitura & Debate Acadêmico', 'Roda de conversa sobre ética em inteligência artificial, ciência aberta e impacto social da tecnologia.', 'UNIVERSITY', '00000000-0000-4000-8000-000000000001', 'Biblioteca Universitária — Sala Multimídia', '2027-02-10T16:00:00Z', '2027-02-10T18:00:00Z', 'CULTURE', 40, '2027-02-09T23:59:00Z', 'INTERNAL_FREE', NULL, NULL, TRUE, 'ORGANIZER_SCANS_PARTICIPANT'),
    ('689696b1-419c-5625-8625-3a778043f15c', 'Workshop Docker, Kubernetes e Cloud Native', 'Oficina mão na massa de containerização multi-stage, orquestração em Kubernetes e observabilidade.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'Laboratório de Redes — DCC/ICET', '2027-02-17T09:00:00Z', '2027-02-17T12:00:00Z', 'ACADEMIC', 90, '2027-02-15T23:59:00Z', 'INTERNAL_FREE', NULL, NULL, TRUE, 'PARTICIPANT_SCANS_EVENT'),
    ('2b3632ac-7f27-50c3-8f45-bccbe9aa9a5d', 'Noite de Xadrez e Jogos de Estratégia', 'Encontro aberto para integração entre cursos com tabuleiros de xadrez, Catan e torneio relâmpago.', 'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'Centro de Convivência — Espaço Cultural', '2027-02-24T18:00:00Z', '2027-02-24T21:00:00Z', 'COMMUNITY', 40, '2027-02-23T23:59:00Z', 'INTERNAL_FREE', NULL, NULL, FALSE, NULL),
    ('9a7f55e2-c330-5d28-8683-a31a1d726a4d', 'Oficina de Escrita Científica e LaTeX', 'Boas práticas para redação de artigos SBC/IEEE, revisão bibliográfica e formatação em LaTeX.', 'PROFESSOR', 'c74960cf-71a5-5aa1-ac00-c3bd4bfd10f0', 'Sala 204 — Pavilhão de Aulas 4', '2027-03-03T14:00:00Z', '2027-03-03T17:00:00Z', 'ACADEMIC', 35, '2027-03-01T23:59:00Z', 'INTERNAL_FREE', NULL, NULL, TRUE, 'ORGANIZER_SCANS_PARTICIPANT'),
    ('a7fded32-3c25-54ce-9b1d-680ea796db8a', 'Feira de Estágios e Carreiras UFLA', 'Empresas parceiras, startups e laboratórios apresentando vagas de estágio, trainee e pesquisa aplicada.', 'UNIVERSITY', '00000000-0000-4000-8000-000000000001', 'Ginásio Poliesportivo UFLA', '2027-03-10T10:00:00Z', '2027-03-10T16:00:00Z', 'CAREER', 250, '2027-03-08T23:59:00Z', 'INTERNAL_FREE', NULL, NULL, TRUE, 'PARTICIPANT_SCANS_EVENT'),
    ('ac00a63c-f690-53c6-9a6a-97e5482d2f4b', 'Minicurso Prático de RAG e LangChain', 'Construção de pipelines de busca vetorial com Qdrant, embeddings multilíngues e modelos Gemini com resiliência.', 'DEPARTMENT', 'af272b7f-015b-5daa-8556-13a6a1ab3e0b', 'Laboratório 03 — DCC/ICET', '2027-03-17T13:00:00Z', '2027-03-17T17:00:00Z', 'RESEARCH', 30, '2027-03-15T23:59:00Z', 'INTERNAL_PAID', 1500, NULL, TRUE, 'PARTICIPANT_SCANS_EVENT'),
    ('4175796b-6a58-50ee-972a-21ec73f3907e', 'Sarau Cultural no Campus Histórico', 'Apresentações musicais, poesia e gastronomia universitária abertas à comunidade de Lavras.', 'UNIVERSITY', '00000000-0000-4000-8000-000000000001', 'Praça do Campus Histórico UFLA', '2027-03-24T17:00:00Z', '2027-03-24T20:30:00Z', 'CULTURE', 300, '2027-03-23T23:59:00Z', 'INTERNAL_FREE', NULL, NULL, FALSE, NULL),
    ('f2d280d2-5914-5d92-ad50-470741a71ffb', 'Encontro UFLA de Software Livre', 'Palestras rápidas, install fest Linux e contribuição para projetos open-source brasileiros.', 'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'Anfiteatro do ICET', '2027-03-31T15:00:00Z', '2027-03-31T18:00:00Z', 'ACADEMIC', 80, '2027-03-29T23:59:00Z', 'INTERNAL_FREE', NULL, NULL, TRUE, 'ORGANIZER_SCANS_PARTICIPANT'),
    ('a9500c3a-df27-58ff-be43-eb1bfb2259d7', 'Simpósio Interdisciplinar de Inovação e Tecnologia', 'Palestras com egressos, mesas-redondas sobre arquitetura distribuída e certificação de presença via QR Code.', 'PROFESSOR', 'c74960cf-71a5-5aa1-ac00-c3bd4bfd10f0', 'Salão de Convenções UFLA', '2027-04-28T09:00:00Z', '2027-04-28T12:00:00Z', 'ACADEMIC', 100, '2027-04-26T23:59:00Z', 'INTERNAL_PAID', 1000, NULL, TRUE, 'PARTICIPANT_SCANS_EVENT')
)
INSERT INTO events (
    id, title, description, organizer_type, organizer_id, location, starts_at, ends_at, category,
    capacity, registration_deadline, registration_mode, price, external_url, attendance_enabled,
    attendance_mode, status, created_at
)
SELECT id::UUID, title, description, organizer_type, organizer_id::UUID, location,
       starts_at::TIMESTAMPTZ, ends_at::TIMESTAMPTZ, category, capacity,
       registration_deadline::TIMESTAMPTZ, registration_mode, price, external_url, attendance_enabled,
       attendance_mode, 'ACTIVE', TIMESTAMPTZ '2026-11-18 12:00:00+00'
FROM demo_events
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    location = EXCLUDED.location,
    registration_mode = EXCLUDED.registration_mode,
    price = EXCLUDED.price,
    attendance_enabled = EXCLUDED.attendance_enabled,
    attendance_mode = EXCLUDED.attendance_mode,
    status = 'ACTIVE';
