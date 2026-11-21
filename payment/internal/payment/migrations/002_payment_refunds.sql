ALTER TABLE charge_projections
    ADD COLUMN refund_reference TEXT;

ALTER TABLE charge_projections
    ADD COLUMN refund_error TEXT;

CREATE TABLE processed_refund_requests (
    message_id UUID PRIMARY KEY,
    charge_id UUID NOT NULL,
    registration_id UUID NOT NULL,
    message_hash CHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX processed_refund_requests_charge_idx ON processed_refund_requests (charge_id);
