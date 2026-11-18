CREATE TABLE opportunities (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    publisher_type VARCHAR(32) NOT NULL
        CHECK (publisher_type IN ('PROFESSOR', 'DEPARTMENT', 'ACADEMIC_ENTITY')),
    publisher_id UUID NOT NULL,
    category TEXT NOT NULL CHECK (length(btrim(category)) > 0),
    deadline TIMESTAMP WITH TIME ZONE,
    external_url TEXT NOT NULL CHECK (length(btrim(external_url)) > 0),
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(80) NOT NULL CHECK (length(btrim(status)) > 0)
);

CREATE INDEX opportunities_status_deadline_created_idx ON opportunities (status, deadline, created_at DESC);
CREATE INDEX opportunities_publisher_type_created_idx ON opportunities (publisher_type, created_at DESC);
CREATE INDEX opportunities_category_created_idx ON opportunities (category, created_at DESC);
