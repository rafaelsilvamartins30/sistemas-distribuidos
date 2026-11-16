CREATE TABLE events (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    organizer_type VARCHAR(80) NOT NULL,
    organizer_id UUID NOT NULL,
    image_url VARCHAR(2048),
    location VARCHAR(255) NOT NULL,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    category VARCHAR(100) NOT NULL,
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    registration_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    registration_mode VARCHAR(32) NOT NULL
        CHECK (registration_mode IN ('INTERNAL_FREE', 'INTERNAL_PAID', 'EXTERNAL_PAID')),
    price BIGINT CHECK (price IS NULL OR price >= 0),
    external_url VARCHAR(2048),
    attendance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    attendance_mode VARCHAR(40)
        CHECK (attendance_mode IS NULL OR attendance_mode IN ('PARTICIPANT_SCANS_EVENT', 'ORGANIZER_SCANS_PARTICIPANT')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT events_start_before_end CHECK (ends_at > starts_at)
);

CREATE INDEX events_status_starts_at_idx ON events (status, starts_at);
CREATE INDEX events_registration_deadline_idx ON events (registration_deadline);
