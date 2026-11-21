ALTER TABLE payment_compensation_cases
    ADD COLUMN refund_status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
        CHECK (refund_status IN ('PENDING', 'COMPLETED', 'FAILED'));

ALTER TABLE payment_compensation_cases
    ADD COLUMN refund_request_message_id UUID;

ALTER TABLE payment_compensation_cases
    ADD COLUMN refund_completed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE payment_compensation_cases
    ADD COLUMN refund_failure_code VARCHAR(64);

ALTER TABLE payment_compensation_cases
    ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE processed_refund_results (
    message_id UUID PRIMARY KEY,
    charge_id UUID NOT NULL,
    registration_id UUID NOT NULL,
    request_message_id UUID NOT NULL,
    message_hash CHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Compensation cases created by earlier versions already represent captured
-- payments that could not confirm a registration. Queue their refunds once.
WITH pending_refunds AS (
    SELECT charge_id, registration_id, payment_message_id, reason, recorded_at, gen_random_uuid() AS request_id
    FROM payment_compensation_cases
    WHERE refund_request_message_id IS NULL
), queued_refunds AS (
    INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload_json, created_at)
    SELECT request_id, 'Charge', charge_id, 'RefundRequested',
        json_build_object(
            'chargeId', charge_id,
            'registrationId', registration_id,
            'paymentMessageId', payment_message_id,
            'reason', reason
        )::text,
        recorded_at
    FROM pending_refunds
    RETURNING id, aggregate_id
)
UPDATE payment_compensation_cases AS cases
SET refund_request_message_id = queued.id, updated_at = CURRENT_TIMESTAMP
FROM queued_refunds AS queued
WHERE cases.charge_id = queued.aggregate_id;
