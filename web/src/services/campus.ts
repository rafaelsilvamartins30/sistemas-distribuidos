export interface University {
  id: string;
  name: string;
  acronym: string;
  description: string;
  generalInfoMarkdown: string;
  currentTerm: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  links: unknown[];
  viewerCanManage?: boolean;
  administratorUserIds?: string[] | null;
}

export interface Department {
  id: string;
  name: string;
  acronym: string;
  description: string;
  generalInfoMarkdown: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  links: unknown[];
  sourceUrl: string | null;
  courses?: CatalogCourse[];
  viewerCanManage?: boolean;
  administratorUserIds?: string[] | null;
}

export interface AcademicUnit {
  id: string;
  code: string;
  name: string;
  description: string;
  generalInfoMarkdown: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  links: unknown[];
  sourceUrl: string | null;
  referenceOnly: boolean;
  viewerCanManage?: boolean;
  administratorUserIds?: string[] | null;
}

export interface CatalogCourse {
  id: string;
  name: string;
  departmentId: string;
}

export interface DepartmentPage {
  items: Department[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface AcademicEntity {
  id: string;
  name: string;
  description: string;
  generalInfoMarkdown: string;
  entityType: string;
  departmentId: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  links: unknown[];
  sourceUrl: string | null;
  sourceAffiliationText: string | null;
  referenceOnly: boolean;
  viewerCanManage?: boolean;
  administratorUserIds?: string[] | null;
}

export interface Community {
  id: string;
  name: string;
  description: string;
  generalInfoMarkdown: string;
  category: string | null;
  departmentId: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  links: unknown[];
  viewerCanManage?: boolean;
  administratorUserIds?: string[] | null;
}

export interface CampusPage<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Semester {
  id: string;
  name: string;
  startOn: string;
  endOn: string;
}

export class CampusApiError extends Error {
  constructor(public readonly status: number) {
    super(`Gateway respondeu com status ${status}.`);
    this.name = "CampusApiError";
  }
}

async function mutate<T>(
  path: string,
  token: string,
  method: "POST" | "PATCH",
  body: unknown,
  gatewayUrl: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<T> {
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new CampusApiError(response.status);
  return (await response.json()) as T;
}

async function request<T>(
  path: string,
  token: string,
  gatewayUrl: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<T> {
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new CampusApiError(response.status);
  return (await response.json()) as T;
}

export function getUniversity(
  token: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<University> {
  return request<University>("/api/v1/web/university", token, gatewayUrl, fetchImpl);
}

export function getSemesters(
  token: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CampusPage<Semester>> {
  return request<CampusPage<Semester>>("/api/v1/web/semesters?page=0&size=100", token, gatewayUrl, fetchImpl);
}

export function createSemester(
  token: string,
  input: Pick<Semester, "name" | "startOn" | "endOn">,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Semester> {
  return mutate("/api/v1/web/semesters", token, "POST", input, gatewayUrl, fetchImpl);
}

export function updateSemester(
  token: string,
  semesterId: string,
  input: Pick<Semester, "name" | "startOn" | "endOn">,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Semester> {
  return mutate(
    `/api/v1/web/semesters/${encodeURIComponent(semesterId)}`,
    token,
    "PATCH",
    input,
    gatewayUrl,
    fetchImpl,
  );
}

export function updateInstitutionalProfile(
  token: string,
  type: "UNIVERSITY" | "ACADEMIC_UNIT" | "DEPARTMENT" | "ACADEMIC_ENTITY" | "COMMUNITY",
  profileId: string,
  input: Record<string, unknown>,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<unknown> {
  const paths = {
    UNIVERSITY: "/api/v1/web/university",
    ACADEMIC_UNIT: `/api/v1/web/academic-units/${encodeURIComponent(profileId)}`,
    DEPARTMENT: `/api/v1/web/departments/${encodeURIComponent(profileId)}`,
    ACADEMIC_ENTITY: `/api/v1/web/entities/${encodeURIComponent(profileId)}`,
    COMMUNITY: `/api/v1/web/communities/${encodeURIComponent(profileId)}`,
  };
  return mutate(paths[type], token, "PATCH", input, gatewayUrl, fetchImpl);
}

export function createUniversityProfile(
  token: string,
  type: "ACADEMIC_UNIT" | "DEPARTMENT",
  input: Record<string, unknown>,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<unknown> {
  const path = type === "ACADEMIC_UNIT" ? "/api/v1/web/academic-units" : "/api/v1/web/departments";
  return mutate(path, token, "POST", input, gatewayUrl, fetchImpl);
}

export function createDepartmentCourse(
  token: string,
  departmentId: string,
  name: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CatalogCourse> {
  return mutate("/api/v1/web/courses", token, "POST", { departmentId, name }, gatewayUrl, fetchImpl);
}

export function getDepartments(
  token: string,
  page = 0,
  size = 20,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<DepartmentPage> {
  return request<DepartmentPage>(
    `/api/v1/web/departments?page=${page}&size=${size}&sort=name`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function getAcademicUnits(
  token: string,
  page = 0,
  size = 20,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CampusPage<AcademicUnit>> {
  return request<CampusPage<AcademicUnit>>(
    `/api/v1/web/academic-units?page=${page}&size=${size}&sort=name`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function getAcademicUnit(
  token: string,
  unitId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<AcademicUnit> {
  return request<AcademicUnit>(
    `/api/v1/web/academic-units/${encodeURIComponent(unitId)}`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function getCourses(
  token: string,
  departmentId: string,
  page = 0,
  size = 100,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CampusPage<CatalogCourse>> {
  const filter = `&departmentId=${encodeURIComponent(departmentId)}`;
  return request<CampusPage<CatalogCourse>>(
    `/api/v1/web/courses?page=${page}&size=${size}${filter}`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function getCourse(
  token: string,
  courseId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CatalogCourse> {
  return request<CatalogCourse>(`/api/v1/web/courses/${encodeURIComponent(courseId)}`, token, gatewayUrl, fetchImpl);
}

export function getDepartment(
  token: string,
  departmentId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Department> {
  return request<Department>(
    `/api/v1/web/departments/${encodeURIComponent(departmentId)}`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function getAcademicEntities(
  token: string,
  page = 0,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  size = 20,
): Promise<CampusPage<AcademicEntity>> {
  return request<CampusPage<AcademicEntity>>(
    `/api/v1/web/entities?page=${page}&size=${size}&sort=name`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function getAcademicEntity(
  token: string,
  entityId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<AcademicEntity> {
  return request<AcademicEntity>(`/api/v1/web/entities/${encodeURIComponent(entityId)}`, token, gatewayUrl, fetchImpl);
}

export function getCommunities(
  token: string,
  page = 0,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  size = 20,
): Promise<CampusPage<Community>> {
  return request<CampusPage<Community>>(
    `/api/v1/web/communities?page=${page}&size=${size}&sort=name`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function getCommunity(
  token: string,
  communityId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Community> {
  return request<Community>(`/api/v1/web/communities/${encodeURIComponent(communityId)}`, token, gatewayUrl, fetchImpl);
}
