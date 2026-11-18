CREATE TABLE IF NOT EXISTS sports (
    id UUID PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    players_on_field INTEGER NOT NULL,
    minimum_roster INTEGER NOT NULL,
    maximum_roster INTEGER NOT NULL,
    allows_draw BOOLEAN NOT NULL,
    win_points INTEGER NOT NULL,
    draw_points INTEGER NOT NULL,
    loss_points INTEGER NOT NULL,
    default_forfeit_score INTEGER NOT NULL,
    rules_markdown TEXT NOT NULL,
    created_by_type VARCHAR(80) NOT NULL,
    created_by_id UUID NOT NULL,
    status VARCHAR(80)
);

CREATE TABLE IF NOT EXISTS competitions (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
    skill_level VARCHAR(80) NOT NULL,
    organizer_type VARCHAR(80) NOT NULL,
    organizer_id UUID NOT NULL,
    manager_user_ids UUID ARRAY NOT NULL,
    target_team_count INTEGER NOT NULL CHECK (target_team_count IN (16, 32)),
    roster_min INTEGER NOT NULL,
    roster_max INTEGER NOT NULL,
    tie_breakers VARCHAR ARRAY NOT NULL,
    team_entry_price BIGINT NOT NULL,
    free_agent_price BIGINT NOT NULL,
    registration_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    draw_seed BIGINT,
    status VARCHAR(80),
    format VARCHAR(32) NOT NULL CHECK (format = 'GROUPS_KNOCKOUT')
);

CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
    skill_level VARCHAR(80) NOT NULL,
    organizer_type VARCHAR(80) NOT NULL,
    organizer_id UUID NOT NULL,
    manager_user_ids UUID ARRAY NOT NULL,
    target_team_count INTEGER NOT NULL,
    roster_min INTEGER NOT NULL,
    roster_max INTEGER NOT NULL,
    tie_breakers VARCHAR ARRAY NOT NULL,
    team_entry_price BIGINT NOT NULL,
    free_agent_price BIGINT NOT NULL,
    registration_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(80),
    round_robin_mode VARCHAR(40) NOT NULL,
    CHECK ((target_team_count = 10 AND round_robin_mode = 'double round-robin')
        OR (target_team_count = 20 AND round_robin_mode = 'single round-robin'))
);
