-- Realistic UFLA sports catalogue with active teams and scheduled matches for local presentation.
INSERT INTO sports (
    id, name, players_on_field, minimum_roster, maximum_roster, allows_draw,
    win_points, draw_points, loss_points, default_forfeit_score, rules_markdown,
    created_by_type, created_by_id, status
)
VALUES
    ('6c46d5e3-b6f5-5dc2-9fc0-806d1444b19e', 'Futsal', 5, 7, 12, TRUE, 3, 1, 0, 3,
     'Partidas em dois tempos de 20 minutos cronometrados no Ginásio Poliesportivo UFLA. Substituições livres na zona técnica; W.O. aplicado após 15 minutos de tolerância com placar 3x0.',
     'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'ACTIVE'),
    ('47099175-0cee-5cc6-9a19-0ea44f357f5e', 'Voleibol', 6, 8, 16, FALSE, 3, 0, 0, 3,
     'Disputa em melhor de 3 sets (25 pontos cada, tie-break de 15 pontos). Obrigatório uniforme numerado e check-in confirmado na quadra antes do aquecimento.',
     'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'ACTIVE'),
    ('4ece71d3-6c3b-5c2f-a525-1e08ef81c196', 'Basquete 3x3', 3, 4, 6, FALSE, 3, 0, 0, 21,
     'Regras oficiais FIBA 3x3 em meia quadra: vence quem atingir 21 pontos ou liderar ao final de 10 minutos corridos. Arremessos dentro do arco valem 1 ponto; fora do arco valem 2 pontos.',
     'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', 'ACTIVE')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    rules_markdown = EXCLUDED.rules_markdown,
    default_forfeit_score = EXCLUDED.default_forfeit_score,
    status = 'ACTIVE';

INSERT INTO competitions (
    id, title, sport_id, skill_level, organizer_type, organizer_id, manager_user_ids,
    target_team_count, roster_min, roster_max, tie_breakers, team_entry_price, free_agent_price,
    registration_deadline, draw_seed, status, format
)
VALUES
    ('58d072c5-7718-55b5-8f2b-88fc8a3811e8', 'Copa UFLA de Futsal 2027',
     '6c46d5e3-b6f5-5dc2-9fc0-806d1444b19e', 'COMPETITIVE', 'ACADEMIC_ENTITY',
     '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', ARRAY[]::UUID[],
     16, 7, 12, ARRAY['SCORE_DIFFERENCE', 'WINS', 'HEAD_TO_HEAD']::VARCHAR[], 5000, 1500,
     TIMESTAMPTZ '2027-01-31 23:59:00+00', NULL, 'OPEN', 'GROUPS_KNOCKOUT'),
    ('f8bd739a-fcc0-5c07-a557-325038b5b0e8', 'Copa Universitária de Voleibol',
     '47099175-0cee-5cc6-9a19-0ea44f357f5e', 'COMPETITIVE', 'ACADEMIC_ENTITY',
     '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', ARRAY[]::UUID[],
     32, 8, 16, ARRAY['WINS', 'HEAD_TO_HEAD']::VARCHAR[], 0, 0,
     TIMESTAMPTZ '2027-02-14 23:59:00+00', NULL, 'OPEN', 'GROUPS_KNOCKOUT')
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    team_entry_price = EXCLUDED.team_entry_price,
    free_agent_price = EXCLUDED.free_agent_price,
    status = 'OPEN';

INSERT INTO seasons (
    id, title, sport_id, skill_level, organizer_type, organizer_id, manager_user_ids,
    target_team_count, roster_min, roster_max, tie_breakers, team_entry_price, free_agent_price,
    registration_deadline, status, round_robin_mode
)
VALUES
    ('1926697a-08e9-5ae4-86ef-491b6e2b363f', 'Liga ICET de Futsal — Turno e Returno',
     '6c46d5e3-b6f5-5dc2-9fc0-806d1444b19e', 'RECREATIONAL', 'ACADEMIC_ENTITY',
     '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', ARRAY[]::UUID[],
     10, 7, 12, ARRAY['SCORE_DIFFERENCE', 'WINS', 'HEAD_TO_HEAD']::VARCHAR[], 0, 0,
     TIMESTAMPTZ '2027-02-28 23:59:00+00', 'OPEN', 'double round-robin'),
    ('0c3cc646-9a05-533d-a118-8a373f33e86a', 'Liga Aberta de Basquete 3x3 UFLA',
     '4ece71d3-6c3b-5c2f-a525-1e08ef81c196', 'RECREATIONAL', 'ACADEMIC_ENTITY',
     '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', ARRAY[]::UUID[],
     20, 4, 6, ARRAY['WINS', 'HEAD_TO_HEAD']::VARCHAR[], 2000, 500,
     TIMESTAMPTZ '2027-03-14 23:59:00+00', 'OPEN', 'single round-robin')
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title,
    sport_id = EXCLUDED.sport_id,
    roster_min = EXCLUDED.roster_min,
    roster_max = EXCLUDED.roster_max,
    team_entry_price = EXCLUDED.team_entry_price,
    free_agent_price = EXCLUDED.free_agent_price,
    status = 'OPEN';

-- Sample confirmed teams and live matches in Copa UFLA de Futsal 2027
INSERT INTO sports_teams (id, context_type, context_id, name, captain_user_id, status, created_at)
VALUES
    ('70000000-0000-4000-8000-000000000001', 'COMPETITION', '58d072c5-7718-55b5-8f2b-88fc8a3811e8',
     'Atlética Computação FC', 'seed-captain-dcc', 'CONFIRMED', TIMESTAMPTZ '2026-11-19 14:00:00+00'),
    ('70000000-0000-4000-8000-000000000002', 'COMPETITION', '58d072c5-7718-55b5-8f2b-88fc8a3811e8',
     'Engenharias United', 'seed-captain-eeng', 'CONFIRMED', TIMESTAMPTZ '2026-11-19 15:00:00+00'),
    ('70000000-0000-4000-8000-000000000003', 'COMPETITION', '58d072c5-7718-55b5-8f2b-88fc8a3811e8',
     'Agronomia Lavras', 'seed-captain-esal', 'CONFIRMED', TIMESTAMPTZ '2026-11-19 16:00:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sports_team_members (id, team_id, user_id, display_name, role, joined_at)
VALUES
    ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'seed-captain-dcc', 'Lucas Andrade (BCC)', 'CAPTAIN', TIMESTAMPTZ '2026-11-19 14:00:00+00'),
    ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000001', NULL, 'Gabriel Souza', 'MEMBER', TIMESTAMPTZ '2026-11-19 14:00:00+00'),
    ('71000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000001', NULL, 'Matheus Costa', 'MEMBER', TIMESTAMPTZ '2026-11-19 14:00:00+00'),
    ('71000000-0000-4000-8000-000000000004', '70000000-0000-4000-8000-000000000002', 'seed-captain-eeng', 'Pedro Henrique (EENG)', 'CAPTAIN', TIMESTAMPTZ '2026-11-19 15:00:00+00'),
    ('71000000-0000-4000-8000-000000000005', '70000000-0000-4000-8000-000000000002', NULL, 'Thiago Lima', 'MEMBER', TIMESTAMPTZ '2026-11-19 15:00:00+00'),
    ('71000000-0000-4000-8000-000000000006', '70000000-0000-4000-8000-000000000003', 'seed-captain-esal', 'Bruno Oliveira (ESAL)', 'CAPTAIN', TIMESTAMPTZ '2026-11-19 16:00:00+00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sports_matches (
    id, context_type, context_id, round_number, home_team_id, away_team_id,
    scheduled_at, location, home_score, away_score, status, checkin_token, created_at
)
VALUES
    ('72000000-0000-4000-8000-000000000001', 'COMPETITION', '58d072c5-7718-55b5-8f2b-88fc8a3811e8', 1,
     '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
     TIMESTAMPTZ '2026-11-28 19:00:00+00', 'Ginásio Poliesportivo UFLA — Quadra 1', 4, 2, 'COMPLETED', NULL, TIMESTAMPTZ '2026-11-20 10:00:00+00'),
    ('72000000-0000-4000-8000-000000000002', 'COMPETITION', '58d072c5-7718-55b5-8f2b-88fc8a3811e8', 2,
     '70000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000003',
     TIMESTAMPTZ '2026-12-05 19:00:00+00', 'Ginásio Poliesportivo UFLA — Quadra 1', NULL, NULL, 'SCHEDULED', 'UNIR-UFLA2026', TIMESTAMPTZ '2026-11-20 10:00:00+00'),
    ('72000000-0000-4000-8000-000000000003', 'COMPETITION', '58d072c5-7718-55b5-8f2b-88fc8a3811e8', 3,
     '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000003',
     TIMESTAMPTZ '2026-12-12 19:00:00+00', 'Ginásio Poliesportivo UFLA — Quadra 2', NULL, NULL, 'SCHEDULED', NULL, TIMESTAMPTZ '2026-11-20 10:00:00+00')
ON CONFLICT (id) DO NOTHING;
