-- Synthetic sports catalogue for local demonstration only.
-- No teams, participants, matches, results, rankings, or payment records are created.
-- All organizers point to the fictitious Campus entity seeded for local testing.
INSERT INTO sports (
    id, name, players_on_field, minimum_roster, maximum_roster, allows_draw,
    win_points, draw_points, loss_points, default_forfeit_score, rules_markdown,
    created_by_type, created_by_id, status
)
VALUES
    ('6c46d5e3-b6f5-5dc2-9fc0-806d1444b19e', 'Futsal — Demonstração Local', 5, 7, 12, TRUE, 3, 1, 0, 3,
     'Dados sintéticos para demonstração local. Não constituem regulamento oficial; regras e pontuação precisam de validação pela organização antes de uso real.',
     'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', NULL),
    ('47099175-0cee-5cc6-9a19-0ea44f357f5e', 'Voleibol — Demonstração Local', 6, 8, 16, FALSE, 3, 0, 0, 3,
     'Dados sintéticos para demonstração local. Não constituem regulamento oficial; regras e pontuação precisam de validação pela organização antes de uso real.',
     'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', NULL),
    ('4ece71d3-6c3b-5c2f-a525-1e08ef81c196', 'Basquete 3x3 — Demonstração Local', 3, 4, 6, FALSE, 3, 0, 0, 3,
     'Dados sintéticos para demonstração local. Não constituem regulamento oficial; regras e pontuação precisam de validação pela organização antes de uso real.',
     'ACADEMIC_ENTITY', '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO competitions (
    id, title, sport_id, skill_level, organizer_type, organizer_id, manager_user_ids,
    target_team_count, roster_min, roster_max, tie_breakers, team_entry_price, free_agent_price,
    registration_deadline, draw_seed, status, format
)
VALUES
    ('58d072c5-7718-55b5-8f2b-88fc8a3811e8', 'Demonstração local — Copa de Futsal',
     '6c46d5e3-b6f5-5dc2-9fc0-806d1444b19e', 'COMPETITIVE', 'ACADEMIC_ENTITY',
     '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', ARRAY[]::UUID[],
     16, 7, 12, ARRAY['SCORE_DIFFERENCE', 'WINS', 'HEAD_TO_HEAD']::VARCHAR[], 0, 0,
     TIMESTAMPTZ '2027-01-31 23:59:00+00', NULL, NULL, 'GROUPS_KNOCKOUT'),
    ('f8bd739a-fcc0-5c07-a557-325038b5b0e8', 'Demonstração local — Copa de Voleibol',
     '47099175-0cee-5cc6-9a19-0ea44f357f5e', 'COMPETITIVE', 'ACADEMIC_ENTITY',
     '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', ARRAY[]::UUID[],
     32, 8, 16, ARRAY['WINS', 'HEAD_TO_HEAD']::VARCHAR[], 0, 0,
     TIMESTAMPTZ '2027-02-14 23:59:00+00', NULL, NULL, 'GROUPS_KNOCKOUT')
ON CONFLICT (id) DO NOTHING;

INSERT INTO seasons (
    id, title, sport_id, skill_level, organizer_type, organizer_id, manager_user_ids,
    target_team_count, roster_min, roster_max, tie_breakers, team_entry_price, free_agent_price,
    registration_deadline, status, round_robin_mode
)
VALUES
    ('1926697a-08e9-5ae4-86ef-491b6e2b363f', 'Demonstração local — Temporada de Futsal',
     '6c46d5e3-b6f5-5dc2-9fc0-806d1444b19e', 'RECREATIONAL', 'ACADEMIC_ENTITY',
     '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', ARRAY[]::UUID[],
     10, 7, 12, ARRAY['SCORE_DIFFERENCE', 'WINS', 'HEAD_TO_HEAD']::VARCHAR[], 0, 0,
     TIMESTAMPTZ '2027-02-28 23:59:00+00', NULL, 'double round-robin'),
    ('0c3cc646-9a05-533d-a118-8a373f33e86a', 'Demonstração local — Temporada de Voleibol',
     '47099175-0cee-5cc6-9a19-0ea44f357f5e', 'RECREATIONAL', 'ACADEMIC_ENTITY',
     '7c28d2cd-af5d-53fa-a4b9-6596b0ddd568', ARRAY[]::UUID[],
     20, 8, 16, ARRAY['WINS', 'HEAD_TO_HEAD']::VARCHAR[], 0, 0,
     TIMESTAMPTZ '2027-03-14 23:59:00+00', NULL, 'single round-robin')
ON CONFLICT (id) DO NOTHING;
