ALTER TABLE sports_matches
    ADD COLUMN home_penalty_score INTEGER CHECK (home_penalty_score IS NULL OR home_penalty_score >= 0),
    ADD COLUMN away_penalty_score INTEGER CHECK (away_penalty_score IS NULL OR away_penalty_score >= 0);
