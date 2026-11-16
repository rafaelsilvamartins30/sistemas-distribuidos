CREATE TABLE payment_events (
    id UUID PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    aggregate_version BIGINT NOT NULL CHECK (aggregate_version > 0),
    event_type VARCHAR(80) NOT NULL,
    payload_json JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT payment_events_aggregate_version_uq UNIQUE (aggregate_id, aggregate_version)
);

CREATE TABLE charge_projections (
    charge_id UUID PRIMARY KEY,
    reference_type VARCHAR(32) NOT NULL,
    reference_id UUID NOT NULL,
    payer_user_id TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency CHAR(3) NOT NULL CHECK (currency = 'BRL'),
    status VARCHAR(32) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    provider_reference TEXT,
    pix_copy_paste TEXT,
    qr_code_url TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    CONSTRAINT charge_projections_reference_uq UNIQUE (reference_type, reference_id)
);

CREATE TABLE payment_outbox (
    id UUID PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    aggregate_id UUID NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ
);

CREATE INDEX payment_outbox_unpublished_created_idx
    ON payment_outbox (created_at)
    WHERE published_at IS NULL;

CREATE TABLE processed_messages (
    message_id UUID PRIMARY KEY,
    registration_id UUID NOT NULL,
    message_hash CHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL
);
