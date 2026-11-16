ALTER TABLE processed_payment_confirmations ADD COLUMN charge_id UUID;

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
