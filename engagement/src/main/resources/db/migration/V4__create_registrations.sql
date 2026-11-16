CREATE TABLE registrations (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES events (id),
    user_id VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL
        CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED_BY_USER', 'PAYMENT_FAILED', 'PAYMENT_EXPIRED', 'CANCELLED_BY_EVENT')),
    registered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT registrations_status_timestamps CHECK (
        (status <> 'CONFIRMED' OR confirmed_at IS NOT NULL)
        AND (status <> 'CANCELLED_BY_USER' OR cancelled_at IS NOT NULL)
    )
);

CREATE INDEX registrations_user_registered_idx ON registrations (user_id, registered_at DESC);
CREATE INDEX registrations_event_status_idx ON registrations (event_id, status);
