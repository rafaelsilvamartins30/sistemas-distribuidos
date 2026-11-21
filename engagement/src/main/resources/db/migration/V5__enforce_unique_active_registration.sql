CREATE UNIQUE INDEX registrations_active_event_user_uq ON registrations (event_id, user_id)
    WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED');
