ALTER TABLE attendance_sessions ADD COLUMN cancelled_at TIMESTAMPTZ;

CREATE TABLE attendance_event_states (
    event_id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'CANCELLED')),
    cancellation_message_id UUID UNIQUE,
    cancellation_hash CHAR(64),
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT attendance_event_cancellation_state CHECK (
        (status = 'ACTIVE' AND cancellation_message_id IS NULL AND cancellation_hash IS NULL AND cancelled_at IS NULL)
        OR (status = 'CANCELLED' AND cancellation_message_id IS NOT NULL
            AND cancellation_hash IS NOT NULL AND cancelled_at IS NOT NULL)
    )
);
