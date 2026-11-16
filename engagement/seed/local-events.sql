INSERT INTO events (
    id, title, description, organizer_type, organizer_id, image_url, location,
    starts_at, ends_at, category, capacity, registration_deadline, registration_mode,
    price, external_url, attendance_enabled, attendance_mode, status, created_at
) VALUES
    (
        '10000000-0000-4000-8000-000000000001',
        'Encontro de Boas-vindas UNIR',
        'Encontro aberto para conhecer projetos e comunidades universitárias.',
        'UNIVERSITY', '20000000-0000-4000-8000-000000000001', NULL,
        'Auditório Central', '2027-06-15T17:00:00Z', '2027-06-15T19:00:00Z',
        'ACADEMIC', 120, '2027-06-14T23:59:00Z', 'INTERNAL_FREE',
        NULL, NULL, TRUE, 'PARTICIPANT_SCANS_EVENT', 'ACTIVE', '2027-01-15T12:00:00Z'
    ),
    (
        '10000000-0000-4000-8000-000000000002',
        'Oficina de Projetos de Software',
        'Atividade prática sobre planejamento e colaboração em projetos de software.',
        'UNIVERSITY', '20000000-0000-4000-8000-000000000002', NULL,
        'Laboratório 2', '2027-06-22T14:00:00Z', '2027-06-22T17:00:00Z',
        'ACADEMIC', 40, '2027-06-20T23:59:00Z', 'INTERNAL_PAID',
        2500, NULL, FALSE, NULL, 'ACTIVE', '2027-01-15T12:00:00Z'
    )
ON CONFLICT (id) DO NOTHING;
