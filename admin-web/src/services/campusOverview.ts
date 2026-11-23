export interface UniversitySummary {
  id: string;
  name: string;
  acronym: string;
  description: string;
  currentTerm: string;
  administratorUserIds?: string[];
}

export interface DepartmentSummary {
  id: string;
  name: string;
  acronym: string;
  description: string;
  administratorUserIds?: string[];
}

export interface AcademicUnitSummary {
  id: string;
  code: string;
  name: string;
  description: string;
  administratorUserIds?: string[];
}

export interface AcademicEntitySummary {
  id: string;
  name: string;
  description: string;
  entityType: string;
  administratorUserIds?: string[];
}

export interface CommunitySummary {
  id: string;
  name: string;
  description: string;
  category: string | null;
  administratorUserIds?: string[];
}

export interface CourseSummary {
  id: string;
  name: string;
  departmentId: string;
}

export interface SemesterSummary {
  id: string;
  name: string;
  startOn?: string;
  endOn?: string;
}

export interface CampusUserSummary {
  id: string;
  keycloakUserId: string;
  name: string;
  registrationCode: string | null;
  userType: string | null;
}

export interface InstitutionalRequestSummary {
  id: string;
  type: "PROFESSOR_VERIFICATION" | "COMMUNITY_CREATION" | "ENTITY_CREATION";
  title: string;
  requesterName: string | null;
  targetDepartmentName: string | null;
  targetType: "DEPARTMENT" | "UNIVERSITY";
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

interface Page<T> {
  items: T[];
  totalElements: number;
}

export interface CampusOverview {
  university: UniversitySummary;
  academicUnits: Page<AcademicUnitSummary>;
  departments: Page<DepartmentSummary>;
  entities: Page<AcademicEntitySummary>;
  communities: Page<CommunitySummary>;
  pendingRequests: Page<InstitutionalRequestSummary>;
  courses?: Page<CourseSummary>;
  semesters?: Page<SemesterSummary>;
  users?: { items: CampusUserSummary[] };
}

export type PermissionTargetKind = "university" | "academic-units" | "departments" | "entities" | "communities";
export type DeletableStructureKind =
  | "academic-units"
  | "departments"
  | "courses"
  | "semesters"
  | "entities"
  | "communities";

export class CampusOverviewError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`Falha ao consultar ${path} (${status}).`);
    this.name = "CampusOverviewError";
  }
}

async function request<T>(
  gatewayUrl: string,
  path: string,
  token: string,
  fetchImpl: typeof globalThis.fetch,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new CampusOverviewError(response.status, path);
  return (await response.json()) as T;
}

export async function getCampusOverview(
  gatewayUrl: string,
  token: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CampusOverview> {
  return request<CampusOverview>(gatewayUrl, "/api/v1/admin/overview", token, fetchImpl);
}

export async function reviewInstitutionalRequest(
  gatewayUrl: string,
  token: string,
  requestId: string,
  decision: "approve" | "reject",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
  const path = `/api/v1/admin/requests/${encodeURIComponent(requestId)}/${decision}`;
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new CampusOverviewError(response.status, path);
}

export async function createAcademicUnit(
  gatewayUrl: string,
  token: string,
  payload: { code: string; name: string; description: string; generalInfoMarkdown: string },
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<AcademicUnitSummary> {
  return request<AcademicUnitSummary>(gatewayUrl, "/api/v1/admin/academic-units", token, fetchImpl, "POST", payload);
}

export async function createDepartment(
  gatewayUrl: string,
  token: string,
  payload: { acronym: string; name: string; description: string; generalInfoMarkdown: string },
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<DepartmentSummary> {
  return request<DepartmentSummary>(gatewayUrl, "/api/v1/admin/departments", token, fetchImpl, "POST", payload);
}

export async function createCourse(
  gatewayUrl: string,
  token: string,
  payload: { departmentId: string; name: string },
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CourseSummary> {
  return request<CourseSummary>(gatewayUrl, "/api/v1/admin/courses", token, fetchImpl, "POST", payload);
}

export async function createSemester(
  gatewayUrl: string,
  token: string,
  payload: { name: string; startOn: string; endOn: string },
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<SemesterSummary> {
  return request<SemesterSummary>(gatewayUrl, "/api/v1/admin/semesters", token, fetchImpl, "POST", payload);
}

export async function updateProfileAdministrators(
  gatewayUrl: string,
  token: string,
  kind: PermissionTargetKind,
  id: string | null,
  administratorUserIds: string[],
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
  const path =
    kind === "university" ? "/api/v1/admin/university" : `/api/v1/admin/${kind}/${encodeURIComponent(id ?? "")}`;
  await request<unknown>(gatewayUrl, path, token, fetchImpl, "PATCH", { administratorUserIds });
}

export async function updateUniversityProfile(
  gatewayUrl: string,
  token: string,
  payload: { name: string; acronym: string; description: string; currentTerm: string },
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<UniversitySummary> {
  return request<UniversitySummary>(gatewayUrl, "/api/v1/admin/university", token, fetchImpl, "PATCH", payload);
}

export async function deleteCampusStructure(
  gatewayUrl: string,
  token: string,
  kind: DeletableStructureKind,
  id: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
  const path = `/api/v1/admin/${kind}/${encodeURIComponent(id)}`;
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new CampusOverviewError(response.status, path);
}
