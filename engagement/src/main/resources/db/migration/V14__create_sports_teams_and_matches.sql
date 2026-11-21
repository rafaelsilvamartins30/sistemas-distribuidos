CREATE TABLE sports_teams (
    id UUID PRIMARY KEY,
    context_type VARCHAR(16) NOT NULL CHECK (context_type IN ('COMPETITION', 'SEASON')),
    context_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    captain_user_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('CONFIRMED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sports_teams_context ON sports_teams (context_type, context_id);

CREATE TABLE sports_team_members (
    id UUID PRIMARY KEY,
    team_id UUID NOT NULL REFERENCES sports_teams(id) ON DELETE CASCADE,
    user_id VARCHAR(128),
    display_name VARCHAR(160) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('CAPTAIN', 'MEMBER', 'FREE_AGENT')),
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sports_team_members_team ON sports_team_members (team_id);
CREATE INDEX idx_sports_team_members_user ON sports_team_members (user_id);

CREATE TABLE sports_free_agents (
    id UUID PRIMARY KEY,
    context_type VARCHAR(16) NOT NULL CHECK (context_type IN ('COMPETITION', 'SEASON')),
    context_id UUID NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    allocated_team_id UUID REFERENCES sports_teams(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('QUEUED', 'ALLOCATED')),
    registered_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sports_free_agents_context ON sports_free_agents (context_type, context_id);

CREATE TABLE sports_matches (
    id UUID PRIMARY KEY,
    context_type VARCHAR(16) NOT NULL CHECK (context_type IN ('COMPETITION', 'SEASON')),
    context_id UUID NOT NULL,
    round_number INTEGER NOT NULL CHECK (round_number >= 1),
    home_team_id UUID NOT NULL REFERENCES sports_teams(id) ON DELETE CASCADE,
    away_team_id UUID NOT NULL REFERENCES sports_teams(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    location VARCHAR(200) NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    status VARCHAR(32) NOT NULL CHECK (status IN ('SCHEDULED', 'COMPLETED')),
    checkin_token VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX idx_sports_matches_context ON sports_matches (context_type, context_id);

CREATE TABLE sports_match_checkins (
    id UUID PRIMARY KEY,
    match_id UUID NOT NULL REFERENCES sports_matches(id) ON DELETE CASCADE,
    user_id VARCHAR(128) NOT NULL,
    team_id UUID NOT NULL REFERENCES sports_teams(id) ON DELETE CASCADE,
    checked_in_at TIMESTAMP WITH TIME ZONE NOT NULL,
    UNIQUE (match_id, user_id)
);
