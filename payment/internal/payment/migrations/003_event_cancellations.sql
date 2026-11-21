CREATE TABLE cancelled_registrations (
    registration_id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    cancellation_message_id UUID NOT NULL UNIQUE,
    message_hash CHAR(64) NOT NULL,
    cancelled_at TIMESTAMPTZ NOT NULL
);
