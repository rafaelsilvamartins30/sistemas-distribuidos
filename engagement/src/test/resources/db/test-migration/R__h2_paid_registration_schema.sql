ALTER TABLE registrations
    ADD COLUMN payment_deadline_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE registrations
    ADD COLUMN reservation_expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE registrations
    ADD CONSTRAINT registrations_payment_deadlines CHECK (
        (payment_deadline_at IS NULL AND reservation_expires_at IS NULL)
        OR (payment_deadline_at IS NOT NULL AND reservation_expires_at IS NOT NULL
            AND reservation_expires_at > payment_deadline_at)
    );

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(120) NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX outbox_created_idx ON outbox_events (published_at, created_at);
