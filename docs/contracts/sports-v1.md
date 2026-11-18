# Engagement Sports Catalog v1

The Web catalog reads Sports data owned by Engagement. The browser sends its bearer token through Gateway and Web BFF; both forward the original token. This release exposes read-only queries to `USER` and `PLATFORM_ADMIN`. It does not expose creation or management operations, because contextual authorization for sports organizers is not available in this path yet.

## Endpoints

All list endpoints accept `page` (default `0`) and `size` (default `20`, maximum `100`) and return `{ items, page, size, totalElements, totalPages }`.

| Engagement endpoint | Filters |
| --- | --- |
| `GET /api/v1/sports` | `q` searches the modality name. |
| `GET /api/v1/sports/{sportId}` | — |
| `GET /api/v1/competitions` | `q` searches competition and sport names; `sportId`, `skillLevel`, `organizerType`, `organizerId`, `targetTeamCount`. |
| `GET /api/v1/competitions/{competitionId}` | — |
| `GET /api/v1/seasons` | `q` searches season and sport names; `sportId`, `skillLevel`, `organizerType`, `organizerId`, `targetTeamCount`. |
| `GET /api/v1/seasons/{seasonId}` | — |

Gateway and Web BFF expose the matching paths under `/api/v1/web`.

## Domain constraints

- Competition is constrained to 16 or 32 teams and `GROUPS_KNOCKOUT`.
- Season is constrained to 10 or 20 teams: 10 uses `double round-robin`; 20 uses `single round-robin`.
- Tie-breakers are strings from the approved `SCORE_DIFFERENCE`, `WINS`, and `HEAD_TO_HEAD` set. Points remain the first classification criterion and are not repeated in this array.
- Competition and Season reference a Sport within Engagement. User and organizer IDs remain UUID references; there are no cross-service foreign keys.
- Prices use the same minor-unit convention as Event prices.
- Listings include records regardless of status or registration deadline, preserving the catalogue history. The source pages define a `status` field but not its allowed values. It remains an opaque, nullable string until that vocabulary is approved; no status filter or lifecycle behavior is inferred here.
- `managerUserIds` is stored on Competition and Season but omitted from public query DTOs because this read path has no contextual manager authorization.
- No team, player, match, result, standings, MongoDB projection, or CQRS event is created in this slice. Query results are read directly from PostgreSQL.

## Local demonstration data

Run `docker compose exec -T engagement-db psql -U unir -d unir_engagement < engagement/seed/local-sports.sql` after the Engagement migration is applied. The deterministic rows are explicitly marked as local demonstrations; `ON CONFLICT (id) DO NOTHING` preserves existing rows. The seed does not create teams or standings.

The seed uses representative roster, points, organizer, and price values only for the local visual demonstration. They must not be treated as official modality or competition rules.
