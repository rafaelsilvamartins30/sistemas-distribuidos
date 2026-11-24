CREATE TABLE events (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    organizer_type VARCHAR(80) NOT NULL,
    organizer_id UUID NOT NULL,
    created_by_user_id VARCHAR(255),
    image_url VARCHAR(2048),
    location VARCHAR(255) NOT NULL,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    category VARCHAR(100) NOT NULL,
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    registration_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    registration_mode VARCHAR(32) NOT NULL
        CHECK (registration_mode IN ('INTERNAL_FREE', 'INTERNAL_PAID', 'EXTERNAL_PAID')),
    price BIGINT CHECK (price IS NULL OR price >= 0),
    external_url VARCHAR(2048),
    attendance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    attendance_mode VARCHAR(40)
        CHECK (attendance_mode IS NULL OR attendance_mode IN ('PARTICIPANT_SCANS_EVENT', 'ORGANIZER_SCANS_PARTICIPANT')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'CANCELLED')),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT events_start_before_end CHECK (ends_at > starts_at),
    CONSTRAINT events_external_paid_requires_url CHECK (
        registration_mode <> 'EXTERNAL_PAID'
        OR (external_url IS NOT NULL AND length(btrim(external_url)) > 0)
    )
);

CREATE INDEX events_status_starts_at_idx ON events (status, starts_at);
CREATE INDEX events_registration_deadline_idx ON events (registration_deadline);

CREATE TABLE registrations (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES events (id),
    user_id VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL
        CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED_BY_USER', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'CANCELLED_BY_EVENT')),
    registered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    payment_deadline_at TIMESTAMP WITH TIME ZONE,
    reservation_expires_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT registrations_status_timestamps CHECK (
        (status <> 'CONFIRMED' OR confirmed_at IS NOT NULL)
        AND (status <> 'CANCELLED_BY_USER' OR cancelled_at IS NOT NULL)
    ),
    CONSTRAINT registrations_payment_deadlines CHECK (
        (payment_deadline_at IS NULL AND reservation_expires_at IS NULL)
        OR (payment_deadline_at IS NOT NULL AND reservation_expires_at IS NOT NULL
            AND reservation_expires_at > payment_deadline_at)
    )
);

CREATE INDEX registrations_user_registered_idx ON registrations (user_id, registered_at DESC);
CREATE INDEX registrations_event_status_idx ON registrations (event_id, status);
CREATE UNIQUE INDEX registrations_active_event_user_uq ON registrations (event_id, user_id)
    WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED');

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(120) NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX outbox_unpublished_created_idx ON outbox_events (created_at)
    WHERE published_at IS NULL;

CREATE TABLE processed_payment_confirmations (
    message_id UUID PRIMARY KEY,
    registration_id UUID NOT NULL,
    message_hash CHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    charge_id UUID
);

CREATE TABLE payment_compensation_cases (
    charge_id UUID PRIMARY KEY,
    registration_id UUID NOT NULL,
    payment_message_id UUID NOT NULL UNIQUE,
    reason VARCHAR(64) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    refund_status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
        CHECK (refund_status IN ('PENDING', 'COMPLETED', 'FAILED')),
    refund_request_message_id UUID,
    refund_completed_at TIMESTAMP WITH TIME ZONE,
    refund_failure_code VARCHAR(64),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE processed_refund_results (
    message_id UUID PRIMARY KEY,
    charge_id UUID NOT NULL,
    registration_id UUID NOT NULL,
    request_message_id UUID NOT NULL,
    message_hash CHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE event_cancellation_refunds (
    registration_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    cancellation_message_id UUID NOT NULL UNIQUE,
    source_payment_message_id UUID,
    charge_id UUID,
    refund_status VARCHAR(16) NOT NULL CHECK (refund_status IN ('PENDING', 'COMPLETED', 'FAILED')),
    refund_completed_at TIMESTAMP WITH TIME ZONE,
    refund_failure_code VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX event_cancellation_refunds_event_idx ON event_cancellation_refunds (event_id);

CREATE TABLE opportunities (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    publisher_type VARCHAR(32) NOT NULL
        CHECK (publisher_type IN ('PROFESSOR', 'DEPARTMENT', 'ACADEMIC_ENTITY')),
    publisher_id UUID NOT NULL,
    category TEXT NOT NULL CHECK (length(btrim(category)) > 0),
    deadline TIMESTAMP WITH TIME ZONE,
    external_url TEXT NOT NULL CHECK (length(btrim(external_url)) > 0),
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(80) NOT NULL CHECK (length(btrim(status)) > 0)
);

CREATE INDEX opportunities_status_deadline_created_idx ON opportunities (status, deadline, created_at DESC);
CREATE INDEX opportunities_publisher_type_created_idx ON opportunities (publisher_type, created_at DESC);
CREATE INDEX opportunities_category_created_idx ON opportunities (category, created_at DESC);

CREATE TABLE sports (
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

CREATE TABLE competitions (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
    skill_level VARCHAR(80) NOT NULL,
    organizer_type VARCHAR(80) NOT NULL,
    organizer_id UUID NOT NULL,
    target_team_count INTEGER NOT NULL CHECK (target_team_count IN (16, 32)),
    roster_min INTEGER NOT NULL,
    roster_max INTEGER NOT NULL,
    team_entry_price BIGINT NOT NULL,
    free_agent_price BIGINT NOT NULL,
    registration_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(80),
    format VARCHAR(32) NOT NULL CHECK (format = 'GROUPS_KNOCKOUT')
);

CREATE INDEX competitions_catalogue_idx ON competitions (sport_id, target_team_count, title);

CREATE TABLE sports_teams (
    id UUID PRIMARY KEY,
    context_type VARCHAR(16) NOT NULL CHECK (context_type IN ('COMPETITION', 'SEASON')),
    context_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    captain_user_id VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL
        CONSTRAINT sports_teams_status_check CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    payment_amount_minor BIGINT,
    payment_deadline_at TIMESTAMP WITH TIME ZONE,
    reservation_expires_at TIMESTAMP WITH TIME ZONE,
    invite_code VARCHAR(32),
    invite_expires_at TIMESTAMP WITH TIME ZONE,
    reserved_player_count INTEGER
);

CREATE INDEX idx_sports_teams_context ON sports_teams (context_type, context_id);
CREATE UNIQUE INDEX sports_teams_invite_code_idx
    ON sports_teams (invite_code)
    WHERE invite_code IS NOT NULL;

CREATE TABLE seasons (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE RESTRICT,
    skill_level VARCHAR(80) NOT NULL,
    organizer_type VARCHAR(80) NOT NULL,
    organizer_id UUID NOT NULL,
    target_team_count INTEGER NOT NULL,
    roster_min INTEGER NOT NULL,
    roster_max INTEGER NOT NULL,
    team_entry_price BIGINT NOT NULL,
    free_agent_price BIGINT NOT NULL,
    registration_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(80),
    round_robin_mode VARCHAR(40) NOT NULL,
    manual_champion_team_id UUID REFERENCES sports_teams(id),
    CHECK ((target_team_count = 10 AND round_robin_mode = 'double round-robin')
        OR (target_team_count = 20 AND round_robin_mode = 'single round-robin'))
);

CREATE INDEX seasons_catalogue_idx ON seasons (sport_id, target_team_count, title);

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
    status VARCHAR(32) NOT NULL
        CONSTRAINT sports_free_agents_status_check CHECK (status IN ('PENDING_PAYMENT', 'QUEUED', 'ALLOCATED', 'CANCELLED')),
    registered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    payment_amount_minor BIGINT,
    payment_deadline_at TIMESTAMP WITH TIME ZONE,
    reservation_expires_at TIMESTAMP WITH TIME ZONE
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
    home_penalty_score INTEGER CHECK (home_penalty_score IS NULL OR home_penalty_score >= 0),
    away_penalty_score INTEGER CHECK (away_penalty_score IS NULL OR away_penalty_score >= 0),
    status VARCHAR(32) NOT NULL CHECK (status IN ('SCHEDULED', 'COMPLETED')),
    checkin_token VARCHAR(64),
    attendance_closed_at TIMESTAMP WITH TIME ZONE,
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
