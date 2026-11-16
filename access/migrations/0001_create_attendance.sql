CREATE TABLE attendance_sessions (
    id UUID PRIMARY KEY,
    source_type VARCHAR(40) NOT NULL,
    source_id UUID NOT NULL,
    source_title VARCHAR(200) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    mode VARCHAR(40) NOT NULL CHECK (mode IN ('PARTICIPANT_SCANS_EVENT', 'ORGANIZER_SCANS_PARTICIPANT')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
    check_in_opens_at TIMESTAMPTZ,
    check_in_closes_at TIMESTAMPTZ,
    shared_token_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT attendance_sessions_source_unique UNIQUE (source_type, source_id),
    CONSTRAINT attendance_sessions_start_before_end CHECK (ends_at > starts_at),
    CONSTRAINT attendance_sessions_check_in_window CHECK (
        (check_in_opens_at IS NULL AND check_in_closes_at IS NULL)
        OR (check_in_opens_at IS NOT NULL AND check_in_closes_at IS NOT NULL
            AND check_in_closes_at > check_in_opens_at)
    )
);

CREATE TABLE attendance_entries (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES attendance_sessions (id),
    user_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ELIGIBLE', 'CANCELLED', 'ATTENDED', 'NO_SHOW')),
    participant_token_hash TEXT,
    registered_at TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    attended_at TIMESTAMPTZ,
    finalized_at TIMESTAMPTZ
);

CREATE INDEX attendance_entries_session_user_idx ON attendance_entries (session_id, user_id);

CREATE TABLE processed_messages (
    message_id UUID PRIMARY KEY,
    registration_id UUID NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE processed_registrations (
    registration_id UUID PRIMARY KEY,
    payload_hash CHAR(64) NOT NULL,
    attendance_entry_id UUID REFERENCES attendance_entries (id),
    processed_at TIMESTAMPTZ NOT NULL
);
