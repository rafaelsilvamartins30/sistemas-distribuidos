ALTER TABLE sports_teams
    ADD COLUMN IF NOT EXISTS invite_code VARCHAR(32),
    ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS reserved_player_count INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS sports_teams_invite_code_idx
    ON sports_teams (invite_code)
    WHERE invite_code IS NOT NULL;
