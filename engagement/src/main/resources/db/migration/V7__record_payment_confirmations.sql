CREATE TABLE processed_payment_confirmations (
    message_id UUID PRIMARY KEY,
    registration_id UUID NOT NULL,
    message_hash CHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE payment_compensation_cases (
    charge_id UUID PRIMARY KEY,
    registration_id UUID NOT NULL,
    payment_message_id UUID NOT NULL UNIQUE,
    reason VARCHAR(64) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL
);
