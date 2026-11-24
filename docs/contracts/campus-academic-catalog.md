# Campus academic catalog

## Ownership and relationships

Campus owns the university's institutional profiles and academic catalog. `University` is a singleton. `AcademicUnit` and `Department` are peer institutional profiles; a Department is not a child of an AcademicUnit. A Department owns its named `Course` rows. User profiles select a Department and one of its Courses directly. An AcademicUnit is not part of the user profile relation.

Course rows imported from `campus/db/seed_data/ufla_catalogo_referencia_2026-11-18.json` remain source-only references because that source associates them with units, not departments. They are retained for reference and excluded from user selectors. The local demonstration seed creates clearly local Department-owned course rows for its eight synthetic profiles; it does not infer course-to-department relations from the source catalog.

The catalog JSON retains source URLs. Its 107 extension entities and five complementary student organizations preserve source category, URL, and affiliation text, but are reference-only. Source affiliation text does not become a foreign-key relationship or grant profile management or publication rights.

## Permissions and profile lifecycle

- Only the global platform administrator can edit the singleton University and create AcademicUnits and Departments. Department and other profile administrators remain contextual.
- Department administrators can edit that Department and its Courses.
- AcademicUnit, Department, AcademicEntity, Community, and University share description, contact links, Markdown, and administrator IDs. Only an administrator listed on that profile can edit it or change its administrator list. Campus returns that list only to the profile's administrators; the Web BFF removes it from other viewers' responses.
- The global administrator account (`ADMIN-0001`) has access to every institutional profile, even when an older record does not yet list it. Campus always includes it in administrator responses and re-adds it when a profile is saved; Administration does not expose a removal action for it. University contextual administrator assignment is rejected.
- AcademicEntity and Community are created through institutional requests. An entity/community request targets a Department or the University (a missing/null `targetDepartmentId`). An administrator of that target may approve or reject it. Approval creates the profile and adds the requester as its initial administrator.
- A professor request uses the Department saved on the user's Campus profile. Only approval by an administrator of that Department creates or activates `ProfessorAffiliation`; the self-declared profile value is not authorization.

## HTTP contract

All routes below require an authenticated Keycloak bearer token through the Gateway.

| Route | Purpose |
| --- | --- |
| `GET /university` / `PATCH /university` | Read or edit the singleton profile |
| `GET, POST /academic-units`; `GET, PATCH /academic-units/{id}` | List/detail and University-admin-managed profile |
| `GET, POST /departments`; `GET, PATCH /departments/{id}` | List/detail and University-admin creation or Department-admin edit |
| `GET /courses?departmentId={id}` / `GET /courses/{id}` | List active Department courses and details |
| `POST /courses` / `PATCH /courses/{id}` | Department-admin-managed course names |
| `GET /entities`, `GET /entities/{id}`, `PATCH /entities/{id}` | Read or edit an AcademicEntity profile |
| `GET /communities`, `GET /communities/{id}`, `PATCH /communities/{id}` | Read or edit a Community profile |
| `POST /requests` | Request Community or AcademicEntity creation |
| `GET /requests/me`, `GET /requests/pending` | List the caller's requests or requests for the caller's administered targets |
| `POST /requests/{id}/approve`, `POST /requests/{id}/reject` | Review a request as an administrator of its target |
| `/professor-verification-requests...` | Existing professor verification request and affiliation review flow |

List APIs use `items`, `page`, `size`, `totalElements`, and `totalPages`; size is limited to 100. The course list requires an existing `departmentId` and omits `referenceOnly` rows. Profile edits and reviews are authorized again inside Campus using the JWT `sub` and stored administrator IDs; the global account also needs both the `PLATFORM_ADMIN` role and the `ADMIN-0001` Campus profile.

The self-service user-profile API accepts `courseId` and `departmentId`; Campus verifies that the selected Course belongs to that Department. The public response keeps the display names `course` and `department`, along with their IDs. `institutionalId`, affiliation status, and academic level retain their existing public contract. `PROFESSOR` in that profile remains self-declared; it never creates an affiliation by itself.

## Local demonstration data

Catalog IDs use UUIDv5 values derived from namespace `6bc5849c-694a-4cef-8839-6b9ef7ad5cf4` and stable catalog keys. The local seed is deterministic and additive. It includes one explicitly fictional entity, five fictional communities, local Department-owned courses, and eight Keycloak accounts whose private credentials stay in the ignored `config/local-demo-accounts.json` file.
