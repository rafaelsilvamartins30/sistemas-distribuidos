CREATE TABLE users_new (
    id VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    name VARCHAR(255) NOT NULL,
    institutional_id VARCHAR(255) NOT NULL UNIQUE,
    course VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL
);

INSERT INTO users_new (id, created_at, updated_at, name, institutional_id, course, department)
SELECT CAST(id AS VARCHAR(255)), created_at, updated_at, name, institutional_id, course, department
FROM users;

CREATE TABLE user_interests_new (
    user_id VARCHAR(255) NOT NULL REFERENCES users_new(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    interest VARCHAR(255) NOT NULL,
    PRIMARY KEY (user_id, position)
);

INSERT INTO user_interests_new (user_id, position, interest)
SELECT CAST(user_id AS VARCHAR(255)), position, interest
FROM user_interests;

DROP TABLE user_interests;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
ALTER TABLE user_interests_new RENAME TO user_interests;
