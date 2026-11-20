ALTER TABLE attendance_sessions
    ADD COLUMN event_creator_user_id VARCHAR(255);

ALTER TABLE attendance_entries
    ADD COLUMN registration_id UUID;

UPDATE attendance_entries entries
SET registration_id = registrations.registration_id
FROM processed_registrations registrations
WHERE registrations.attendance_entry_id = entries.id;

CREATE UNIQUE INDEX attendance_entries_registration_unique
    ON attendance_entries (registration_id)
    WHERE registration_id IS NOT NULL;

CREATE UNIQUE INDEX attendance_entries_participant_token_unique
    ON attendance_entries (participant_token_hash)
    WHERE participant_token_hash IS NOT NULL;
