# Campus — Semestres

Campus owns the university's semester catalog and is the source of truth for the dates used by semester filters.

## Data

Each semester belongs to the singleton University and contains `id`, `name`, `startOn`, and `endOn`. The name uses `YYYY/1` or `YYYY/2`; dates are inclusive and the end date cannot precede the start date. Semester records are retained so historic posts can continue to be filtered. There is no delete operation.

## HTTP contract

- `GET /semesters?page=0&size=100` returns the standard paginated envelope.
- `GET /semesters/:id` returns one semester.
- `POST /semesters` creates `{ "name", "startOn", "endOn" }`.
- `PATCH /semesters/:id` updates any of those fields.

Every request requires a valid Keycloak bearer token. Reads are available to authenticated users. Campus checks the University's `administrator_user_ids` against the authenticated `sub` on each create or update; a platform role or client-provided user ID does not authorize the write.

The Web consumes the catalog through Web BFF and Gateway. It uses semester names in feed and institutional-post filters. Campus preserves the existing `currentTerm` profile field for compatibility; calendar upload and additional term lifecycle rules are out of scope.
