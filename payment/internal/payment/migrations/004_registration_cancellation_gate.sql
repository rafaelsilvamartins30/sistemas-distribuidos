CREATE TABLE payment_registration_gates (
    registration_id UUID PRIMARY KEY,
    cancelled BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO payment_registration_gates (registration_id, cancelled)
SELECT registration_id, TRUE FROM cancelled_registrations
ON CONFLICT (registration_id) DO UPDATE SET cancelled = TRUE;
