UPDATE attendance_sessions
SET check_in_opens_at = starts_at,
    check_in_closes_at = ends_at
WHERE check_in_opens_at IS NULL OR check_in_closes_at IS NULL;

ALTER TABLE attendance_sessions
    ALTER COLUMN check_in_opens_at SET NOT NULL,
    ALTER COLUMN check_in_closes_at SET NOT NULL;

CREATE UNIQUE INDEX attendance_sessions_shared_token_hash_unique
    ON attendance_sessions (shared_token_hash)
    WHERE shared_token_hash IS NOT NULL;

CREATE TABLE check_ins (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES attendance_sessions (id),
    attendance_entry_id UUID NOT NULL UNIQUE REFERENCES attendance_entries (id),
    method VARCHAR(40) NOT NULL CHECK (method IN ('PARTICIPANT_SCANS_EVENT', 'ORGANIZER_SCANS_PARTICIPANT')),
    validated_by_user_id VARCHAR(255),
    checked_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX check_ins_session_idx ON check_ins (session_id, checked_at);
