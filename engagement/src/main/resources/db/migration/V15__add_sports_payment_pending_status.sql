ALTER TABLE sports_teams DROP CONSTRAINT IF EXISTS sports_teams_status_check;
ALTER TABLE sports_teams
    ADD CONSTRAINT sports_teams_status_check CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED'));

ALTER TABLE sports_free_agents DROP CONSTRAINT IF EXISTS sports_free_agents_status_check;
ALTER TABLE sports_free_agents
    ADD CONSTRAINT sports_free_agents_status_check CHECK (status IN ('PENDING_PAYMENT', 'QUEUED', 'ALLOCATED'));
