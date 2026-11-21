ALTER TABLE events
    ADD CONSTRAINT events_external_paid_requires_url
    CHECK (
        registration_mode <> 'EXTERNAL_PAID'
        OR (external_url IS NOT NULL AND length(btrim(external_url)) > 0)
    );
