-- Deterministic, explicitly synthetic catalogue data for local demonstrations.
-- No teams, registrations, matches, results, or standings are created.
INSERT INTO sports (id, name, players_on_field, minimum_roster, maximum_roster, allows_draw, win_points, draw_points,
                    loss_points, default_forfeit_score, rules_markdown, created_by_type, created_by_id, status)
VALUES ('20000000-0000-4000-8000-000000000301', 'Futsal (demonstração local)', 5, 7, 12, TRUE, 3, 1, 0, 3,
        'Dados sintéticos de demonstração local. Este cadastro não é um regulamento oficial.', 'ACADEMIC_ENTITY',
        '10000000-0000-4000-8000-000000000101', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO competitions (id, title, sport_id, skill_level, organizer_type, organizer_id, manager_user_ids,
                          target_team_count, roster_min, roster_max, tie_breakers, team_entry_price, free_agent_price,
                          registration_deadline, draw_seed, status, format)
VALUES ('20000000-0000-4000-8000-000000000302', 'Demonstração local — Copa UNIR de Futsal',
        '20000000-0000-4000-8000-000000000301', 'COMPETITIVE', 'ACADEMIC_ENTITY',
        '10000000-0000-4000-8000-000000000101', ARRAY[]::UUID[], 16, 7, 12, ARRAY[]::VARCHAR[], 22000, 3500,
        TIMESTAMP WITH TIME ZONE '2027-04-01 23:59:00+00', NULL, NULL, 'GROUPS_KNOCKOUT')
ON CONFLICT (id) DO NOTHING;

INSERT INTO seasons (id, title, sport_id, skill_level, organizer_type, organizer_id, manager_user_ids,
                     target_team_count, roster_min, roster_max, tie_breakers, team_entry_price, free_agent_price,
                     registration_deadline, status, round_robin_mode)
VALUES ('20000000-0000-4000-8000-000000000303', 'Demonstração local — Temporada de Futsal 2027.1',
        '20000000-0000-4000-8000-000000000301', 'RECREATIONAL', 'ACADEMIC_ENTITY',
        '10000000-0000-4000-8000-000000000101', ARRAY[]::UUID[], 10, 7, 12, ARRAY[]::VARCHAR[], 18000, 3000,
        TIMESTAMP WITH TIME ZONE '2027-03-15 23:59:00+00', NULL, 'double round-robin')
ON CONFLICT (id) DO NOTHING;
