ALTER TABLE sports_teams
    ADD COLUMN payment_amount_minor BIGINT,
    ADD COLUMN payment_deadline_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN reservation_expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE sports_free_agents
    ADD COLUMN payment_amount_minor BIGINT,
    ADD COLUMN payment_deadline_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN reservation_expires_at TIMESTAMP WITH TIME ZONE;

UPDATE sports_teams team
SET payment_amount_minor = competition.team_entry_price,
    payment_deadline_at = team.created_at + INTERVAL '15 minutes',
    reservation_expires_at = team.created_at + INTERVAL '20 minutes'
FROM competitions competition
WHERE team.status = 'PENDING_PAYMENT'
  AND team.context_type = 'COMPETITION'
  AND competition.id = team.context_id;

UPDATE sports_teams team
SET payment_amount_minor = season.team_entry_price,
    payment_deadline_at = team.created_at + INTERVAL '15 minutes',
    reservation_expires_at = team.created_at + INTERVAL '20 minutes'
FROM seasons season
WHERE team.status = 'PENDING_PAYMENT'
  AND team.context_type = 'SEASON'
  AND season.id = team.context_id;

UPDATE sports_free_agents agent
SET payment_amount_minor = competition.free_agent_price,
    payment_deadline_at = agent.registered_at + INTERVAL '15 minutes',
    reservation_expires_at = agent.registered_at + INTERVAL '20 minutes'
FROM competitions competition
WHERE agent.status = 'PENDING_PAYMENT'
  AND agent.context_type = 'COMPETITION'
  AND competition.id = agent.context_id;

UPDATE sports_free_agents agent
SET payment_amount_minor = season.free_agent_price,
    payment_deadline_at = agent.registered_at + INTERVAL '15 minutes',
    reservation_expires_at = agent.registered_at + INTERVAL '20 minutes'
FROM seasons season
WHERE agent.status = 'PENDING_PAYMENT'
  AND agent.context_type = 'SEASON'
  AND season.id = agent.context_id;

ALTER TABLE sports_free_agents DROP CONSTRAINT IF EXISTS sports_free_agents_status_check;
ALTER TABLE sports_free_agents
    ADD CONSTRAINT sports_free_agents_status_check
    CHECK (status IN ('PENDING_PAYMENT', 'QUEUED', 'ALLOCATED', 'CANCELLED'));
