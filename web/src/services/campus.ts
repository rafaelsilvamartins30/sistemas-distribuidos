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
}

export interface Community {
  id: string;
  name: string;
  description: string;
  generalInfoMarkdown: string;
  category: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  links: unknown[];
}

export interface CampusPage<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export class CampusApiError extends Error {
  constructor(public readonly status: number) {
    super(`Gateway respondeu com status ${status}.`);
    this.name = "CampusApiError";
  }
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

export function getDepartments(
  token: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<DepartmentPage> {
  return request<DepartmentPage>("/api/v1/web/departments?page=0&size=20&sort=name", token, gatewayUrl, fetchImpl);
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
): Promise<CampusPage<AcademicEntity>> {
  return request<CampusPage<AcademicEntity>>(
    `/api/v1/web/entities?page=${page}&size=20&sort=name`,
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
): Promise<CampusPage<Community>> {
  return request<CampusPage<Community>>(
    `/api/v1/web/communities?page=${page}&size=20&sort=name`,
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
