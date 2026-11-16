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
