ALTER TABLE users RENAME COLUMN affiliation_type TO affiliation_status;
ALTER TABLE users ADD COLUMN academic_level VARCHAR(20);
