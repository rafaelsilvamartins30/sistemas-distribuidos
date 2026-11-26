# Engagement Sports v1

The Sports module in Engagement manages modalities (`Sport`), championships (`Competition`), leagues (`Season`), team and free-agent registrations, simple round-robin match scheduling, scores, and simple match presence check-ins. The Web BFF exposes catalog reads and student participation. The Admin BFF exposes modality and championship creation and organizer operations to the global administrator. Both BFFs forward the original bearer token to Engagement, which remains responsible for domain authorization.

## Endpoints

All list endpoints accept `page` (default `0`) and `size` (default `20`, maximum `100`) and return `{ items, page, size, totalElements, totalPages }`.

| Engagement endpoint | Description |
| --- | --- |
| `GET /api/v1/sports` | List modalities (`q` filters by name). |
| `GET /api/v1/sports/organizer-contexts` | Lists the caller's authorized sports organizer contexts (`UNIVERSITY`, `ACADEMIC_UNIT`, `DEPARTMENT`, `ACADEMIC_ENTITY`, `PROFESSOR`). |
| `POST /api/v1/sports` | Creates a modality (authorized sports organizer only). |
| `GET /api/v1/sports/{sportId}` | Modality details and rules. |
| `GET /api/v1/competitions` | List competitions (`q`, `sportId`, `skillLevel`, `organizerType`, `organizerId`, `targetTeamCount`). |
| `POST /api/v1/competitions` | Creates a competition (32 teams, `GROUPS_KNOCKOUT`, authorized sports organizer only). |
| `GET /api/v1/competitions/{competitionId}` | Competition details. |
| `GET /api/v1/seasons` | List seasons (`q`, `sportId`, `skillLevel`, `organizerType`, `organizerId`, `targetTeamCount`). |
| `POST /api/v1/seasons` | Creates a season (10 teams, `double round-robin`, authorized sports organizer only). |
| `GET /api/v1/seasons/{seasonId}` | Season details. |
| `GET /api/v1/sports-events/{contextType}/{contextId}/overview` | Unified modal payload: event details, modality rules, confirmed teams with rosters, free-agent queue, scheduled/completed matches, and viewer permissions/enrollment status (`contextType` = `COMPETITION` or `SEASON`). |
| `PATCH /api/v1/sports-events/{contextType}/{contextId}` | Updates `registrationDeadline` or sets `championTeamId` for a season with tied leaders (authorized organizer only). |
| `POST /api/v1/sports-events/{contextType}/{contextId}/teams` | Enrolls a team with the authenticated user as `CAPTAIN` and optional initial member names. |
| `POST /api/v1/sports-events/{contextType}/{contextId}/free-agents` | Enrolls the authenticated user as a free agent; auto-allocates to the team with fewest members below `rosterMax`, or queues and auto-forms a new team when the queue reaches `rosterMin`. |
| `POST /api/v1/sports-events/{contextType}/{contextId}/matches/generate` | Generates simple round-robin matches among currently confirmed teams (authorized organizer only; requires ≥ 2 teams). |
| `PATCH /api/v1/sports-matches/{matchId}/score` | Records `homeScore` and `awayScore` and marks the match `COMPLETED` (authorized organizer only). |
| `POST /api/v1/sports-matches/{matchId}/checkin-token` | Generates/rotates a short match presence token (`UNIR-XXXXXXXX`, authorized organizer only). |
| `POST /api/v1/sports-matches/{matchId}/checkins` | Records presence for an enrolled player of either team in the match using the active check-in token. |
| `GET /api/v1/sports-matches/me` | Lists the authenticated user's upcoming and recent matches across enrolled teams. |

Gateway and Web BFF expose participant and catalog paths under `/api/v1/web`. Gateway and Admin BFF expose management paths under `/api/v1/admin`; only the Admin BFF has those management routes.

## Domain constraints

- Competition is constrained to 32 teams and `GROUPS_KNOCKOUT`.
- Season is constrained to 10 teams and `double round-robin`.
- Creation and match management require an authorized internal university organizer context (`UNIVERSITY`, `ACADEMIC_UNIT`, `DEPARTMENT`, `ACADEMIC_ENTITY`) or verified `PROFESSOR` resolved via Campus `GET /internal/v1/event-organizers`. `COMMUNITY` contexts are not authorized to create or manage sports competitions.
- Prices use minor units (centavos).
- Match check-in tokens and attendance records are self-contained inside Engagement (`sports_matches` / `sports_match_checkins`).

## Local demonstration data

Local demonstration data (modality, teams, leagues, events, opportunities, and feed posts) is populated automatically through the public APIs in demo mode (`make k8s-demo` or `make docker-demo`) via `python3 scripts/populate-local-demo.py`.


New schedules require every team to be confirmed with its minimum and reserved roster filled. The season has 18 rounds on Tuesdays and Thursdays. The 32-team competition has eight groups, with two qualifiers each, followed by two-leg rounds of 16, quarterfinals and semifinals, then a single final. Competition rounds take place on Saturdays and Sundays. Tied knockout ties are settled on penalties.

Engagement checks the planned schedule against semester dates obtained from the Campus API. Personal sports filters use the first scheduled match, falling back to the registration deadline before a schedule exists.

When a knockout score leaves the tie level, Engagement responds with HTTP 400 and Problem Details
code `PENALTIES_REQUIRED`. The score is not persisted, and the organizer resubmits the score with
both penalty values. Web and Admin do not need to recalculate the aggregate to decide when to ask.

The sports catalog omits unused `manager_user_ids` and `draw_seed` columns; organizer authorization continues to come from Campus.

Sports overviews expose ordered `standings` and the authoritative `phase`. The tournament
advances the first two teams per group by points, wins, score difference, score for and team name.
The group stage has no extra matches. Points use the sport's win, draw and loss rules.

In a season, exactly two teams level on points after the regular rounds play one extra match
(round code `100`). It does not affect regular-season points or scoring statistics. A draw in the
extra match requires penalties. For three or more teams level on points, the order is wins, points
scored and points conceded (least first). Teams still tied after all criteria share a rank.

The season reserves one eligible day for an extra match. After all scheduled games finish,
Engagement reports the sole first-place team as `championTeamId`. With tied leaders, the organizer
receives `manualChampionCandidates` and can submit one of those IDs as `championTeamId` to the PATCH
endpoint. This completes the season, locks scores and records the chosen champion in Engagement.
The Engagement schema stores `seasons.manual_champion_team_id` and omits the unused `tie_breakers` configuration from both formats.

The overview exposes `knockoutTies` with the paired match IDs, aggregate in first-leg team
order and `winnerTeamId` once decided. Edition and attendance options use the per-match
viewer capabilities. `rosterComplete` applies the larger of the minimum roster and the
reserved player count, including when generation eligibility is evaluated.

Match responses include a display label for the round. `GET /api/v1/payment-references/me`
(used by the Web BFF to enrich `/api/v1/web/payments/me`, alongside the legacy
`/api/v1/sports-payment-origins/me` map) covers event registrations, teams and free agents with
`origin`, `title`, `subtitle` and `targetPath`. References absent from the result are displayed as
unknown.

The sports overview exposes `viewerCanReviewAttendance`, `checkInOpensAt` and `checkInClosesAt`.
Athlete check-in (`POST /api/v1/sports-matches/{matchId}/checkins`) and QR issuance are allowed
whenever the championship is active, a match QR has been generated, and the organizer has not yet
closed the match attendance list (no wall-clock time-window lock). `GET
/api/v1/sports-matches/{matchId}/attendance` lists recorded check-ins live at any time for an
authorized organizer, while `POST` closes the list and revokes the match QR at any time, permanently
blocking further check-ins and new QR generation for that match.
