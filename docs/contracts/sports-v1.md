# Engagement Sports v1

The Sports module in Engagement manages modalities (`Sport`), championships (`Competition`), leagues (`Season`), team and free-agent registrations, simple round-robin match scheduling, scores, and simple match presence check-ins. The browser sends its bearer token through Gateway and Web BFF; both forward the original token.

## Endpoints

All list endpoints accept `page` (default `0`) and `size` (default `20`, maximum `100`) and return `{ items, page, size, totalElements, totalPages }`.

| Engagement endpoint | Description |
| --- | --- |
| `GET /api/v1/sports` | List modalities (`q` filters by name). |
| `GET /api/v1/sports/organizer-contexts` | Lists the caller's authorized sports organizer contexts (`UNIVERSITY`, `ACADEMIC_UNIT`, `DEPARTMENT`, `ACADEMIC_ENTITY`, `PROFESSOR`). |
| `POST /api/v1/sports` | Creates a modality (authorized sports organizer only). |
| `GET /api/v1/sports/{sportId}` | Modality details and rules. |
| `GET /api/v1/competitions` | List competitions (`q`, `sportId`, `skillLevel`, `organizerType`, `organizerId`, `targetTeamCount`). |
| `POST /api/v1/competitions` | Creates a competition (16 or 32 teams, `GROUPS_KNOCKOUT`, authorized sports organizer only). |
| `GET /api/v1/competitions/{competitionId}` | Competition details. |
| `GET /api/v1/seasons` | List seasons (`q`, `sportId`, `skillLevel`, `organizerType`, `organizerId`, `targetTeamCount`). |
| `POST /api/v1/seasons` | Creates a season (10 `double round-robin` or 20 `single round-robin`, authorized sports organizer only). |
| `GET /api/v1/seasons/{seasonId}` | Season details. |
| `GET /api/v1/sports-events/{contextType}/{contextId}/overview` | Unified modal payload: event details, modality rules, confirmed teams with rosters, free-agent queue, scheduled/completed matches, and viewer permissions/enrollment status (`contextType` = `COMPETITION` or `SEASON`). |
| `POST /api/v1/sports-events/{contextType}/{contextId}/teams` | Enrolls a team with the authenticated user as `CAPTAIN` and optional initial member names. |
| `POST /api/v1/sports-events/{contextType}/{contextId}/free-agents` | Enrolls the authenticated user as a free agent; auto-allocates to the team with fewest members below `rosterMax`, or queues and auto-forms a new team when the queue reaches `rosterMin`. |
| `POST /api/v1/sports-events/{contextType}/{contextId}/matches/generate` | Generates simple round-robin matches among currently confirmed teams (authorized organizer only; requires ≥ 2 teams). |
| `PATCH /api/v1/sports-matches/{matchId}/score` | Records `homeScore` and `awayScore` and marks the match `COMPLETED` (authorized organizer only). |
| `POST /api/v1/sports-matches/{matchId}/checkin-token` | Generates/rotates a short match presence token (`UNIR-XXXXXXXX`, authorized organizer only). |
| `POST /api/v1/sports-matches/{matchId}/checkins` | Records presence for an enrolled player of either team in the match using the active check-in token. |
| `GET /api/v1/sports-matches/me` | Lists the authenticated user's upcoming and recent matches across enrolled teams. |

Gateway and Web BFF expose the matching paths under `/api/v1/web`.

## Domain constraints

- Competition is constrained to 16 or 32 teams and `GROUPS_KNOCKOUT`.
- Season is constrained to 10 or 20 teams: 10 uses `double round-robin`; 20 uses `single round-robin`.
- Tie-breakers are strings from the approved `SCORE_DIFFERENCE`, `WINS`, and `HEAD_TO_HEAD` set.
- Creation and match management require an authorized internal university organizer context (`UNIVERSITY`, `ACADEMIC_UNIT`, `DEPARTMENT`, `ACADEMIC_ENTITY`) or verified `PROFESSOR` resolved via Campus `GET /internal/v1/event-organizers`. `COMMUNITY` contexts are not authorized to create or manage sports competitions.
- Prices use minor units (centavos).
- Match check-in tokens and attendance records are self-contained inside Engagement (`sports_matches` / `sports_match_checkins`).

## Local demonstration data

Run `docker compose exec -T engagement-db psql -U unir -d unir_engagement < engagement/seed/local-sports.sql` after the Engagement migrations are applied.
