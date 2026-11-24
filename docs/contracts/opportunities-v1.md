# Opportunity catalog v1

Engagement owns the opportunity catalogue. The Web reads it through the Web BFF
and Gateway; the BFF forwards the caller's bearer token and query parameters.

## Fields

`Opportunity` contains exactly the catalogue fields approved in the
`Engagement — Core` model: `id`, `title`, `description`, `publisherType`,
`publisherId`, `category`, optional `deadline`, `externalUrl`, optional
`imageUrl`, `createdAt`, and `status`.

`publisherType` is stored as text constrained to `PROFESSOR`, `DEPARTMENT`, or
`ACADEMIC_ENTITY`. A `COMMUNITY` cannot publish an opportunity. `status` remains
text because the model has not approved a status enum.

## Read API

- `GET /api/v1/opportunities?page=0&size=20&q=&category=&publisherType=` lists
  active opportunities, newest first. `page` is zero based; `size` must be
  between 1 and 100. `q` matches title, description, or category. `category` is
  an exact case-insensitive category match. `publisherType` accepts only the
  three publisher types above.
- `GET /api/v1/opportunities/{opportunityId}` returns persisted details even
  after the deadline or after status changes, so historical records remain
  inspectable.
- The Web equivalents are `GET /api/v1/web/opportunities` and
  `GET /api/v1/web/opportunities/{opportunityId}`.

The active list requires status `ACTIVE` and either no deadline or a deadline
later than the current time. The model has no internal application record or
submission endpoint; the detail screen follows `externalUrl` only while the
opportunity remains active and its deadline has not passed.

## Contextual publishing authorization

Campus is the authority for institutional affiliation. Engagement does not
authorize from `user_type`, profile values, or caller-supplied `publisherId`,
`publisherType`, or `userId`. `publisherType` and `publisherId` in a create
request select a context; Campus must independently confirm that context for
the subject of the verified bearer token.

Engagement forwards the caller's original JWT to Campus for every permission
lookup. Campus validates that token and derives these contexts from its own
records:

- `DEPARTMENT`: the token subject occurs in that department's registered
  `administrator_user_ids`.
- `ACADEMIC_ENTITY`: the subject occurs in the entity's registered
  `manager_user_ids`.
- `PROFESSOR`: the subject has a Campus profile with a
  `ProfessorAffiliation` in `ACTIVE` status. A profile's declared `user_type`
  does not grant this context.

Campus exposes the internal `GET /internal/v1/opportunity-publishers` contract
to Engagement. It accepts only the bearer token and returns
`{ "items": [{ "publisherType", "publisherId", "name" }] }`; there is no
subject or publisher identity parameter. Engagement's authenticated
`GET /api/v1/opportunities/publisher-contexts` returns this result to the Web.
The Web BFF and Gateway expose it at
`GET /api/v1/web/opportunities/publisher-contexts`.

`POST /api/v1/opportunities` accepts only the opportunity fields `title`,
`description`, `publisherType`, `publisherId`, `category`, optional `deadline`,
`externalUrl`, and optional `imageUrl`. Engagement checks the requested context
against the live Campus response on each call; a mismatch is `403`. `COMMUNITY`
is always rejected. Campus outages fail closed. Engagement assigns `id`,
`createdAt`, and `status=ACTIVE`. Required text fields must be nonblank, URLs
must be HTTP(S), and a supplied deadline must be in the future. The Web
equivalent is `POST /api/v1/web/opportunities`.

- `GET /api/v1/opportunities/managed?page=0&size=20` (Web equivalent:
  `GET /api/v1/web/opportunities/managed`) lists all opportunities belonging to
  any `(publisherType, publisherId)` currently authorized for the authenticated
  caller by Campus, regardless of `status` or `deadline`. Users without
  publisher contexts receive an empty page.
- `PATCH /api/v1/opportunities/{opportunityId}` (Web equivalent:
  `PATCH /api/v1/web/opportunities/{opportunityId}`) allows an authorized
  publisher for that record's `(publisherType, publisherId)` to update `title`,
  `description`, `category`, `deadline` (or `clearDeadline=true`),
  `externalUrl`, `imageUrl` (or `clearImageUrl=true`), and `status` (`ACTIVE`
  or `CLOSED`).
- `DELETE /api/v1/opportunities/{opportunityId}` (Web equivalent:
  `DELETE /api/v1/web/opportunities/{opportunityId}`) performs a logical
  deactivation (`status=CLOSED`) after verifying the caller's publisher context
  with Campus, removing the record from the active board while preserving its
  historical record.

## Professor verification flow

Campus provides the minimum review flow defined in `Engagement — Core` and
`Campus — Domain Flows`:

- `POST /professor-verification-requests` accepts `{}`. Campus derives the
  requester from the JWT and resolves the target department from the saved
  profile's `department` field, which must match an existing Campus Department.
  A caller-supplied department is rejected. Campus reads the profile's
  institutional identifier into the request payload. This identifier is
  self-reported and is shown to a department administrator for manual
  comparison; neither it nor `user_type` is treated as verified evidence.
- Requests use the approved type `PROFESSOR_VERIFICATION` and statuses
  `PENDING`, `APPROVED`, and `REJECTED`. One pending request per user and
  department is allowed. A profile is required. The Campus table also carries
  Rails' `updated_at` persistence timestamp; it is not part of the request
  domain contract or exposed by the API.
- `GET /departments/{departmentId}/professor-verification-requests` returns
  pending items only to an administrator registered for that department.
- `GET /professor-verification-requests/me` returns the authenticated user's
  own request history, newest first, including the department name. It does not
  expose requests from other users.
- `POST /professor-verification-requests/{id}/approve` or `/reject` derives the
  reviewer from the JWT and rechecks department administrator membership. An
  approval creates or reactivates the same-department `ProfessorAffiliation`
  as `ACTIVE`. A rejection creates no affiliation. A different-department
  affiliation cannot be transferred by this flow.

Web-facing equivalents are routed through the BFF and Gateway. They require a
globally authenticated user at the Gateway; Campus applies the contextual
checks. The requester's own status is available at
`GET /api/v1/web/professor-verification-requests/me`; it returns only records
whose `requestedByUserId` matches the authenticated subject, newest first, and
includes the department name. A user with no verified publisher context sees no
publish action. The page offers the teacher verification request and, for
department administrators, pending request review. No internal opportunity
application or submission record is created.

Opportunity details and managed lists expose `available`, `canManage`, `canClose` and
`canReactivate`. PATCH accepts `{ "reactivate": true }` to publish again and clears an
expired deadline on the service. A future deadline is preserved. All writes recheck
publisher authorization against Campus.
