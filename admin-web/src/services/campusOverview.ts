export interface UniversitySummary {
  id: string;
  name: string;
  acronym: string;
  description: string;
  currentTerm: string;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  acronym: string;
  description: string;
}

export interface AcademicEntitySummary {
  id: string;
  name: string;
  description: string;
  entityType: string;
}

export interface CommunitySummary {
  id: string;
  name: string;
  description: string;
  category: string | null;
}

export interface CampusOverview {
  university: UniversitySummary;
  departments: { items: DepartmentSummary[]; totalElements: number };
  entities: { items: AcademicEntitySummary[]; totalElements: number };
  communities: { items: CommunitySummary[]; totalElements: number };
}

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
): Promise<T> {
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new CampusOverviewError(response.status, path);
  return (await response.json()) as T;
}

export async function getCampusOverview(
  gatewayUrl: string,
  token: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CampusOverview> {
  const page = "?page=0&size=20&sort=name";
  const [university, departments, entities, communities] = await Promise.all([
    request<UniversitySummary>(gatewayUrl, "/api/v1/web/university", token, fetchImpl),
    request<{ items: DepartmentSummary[]; totalElements: number }>(
      gatewayUrl,
      `/api/v1/web/departments${page}`,
      token,
      fetchImpl,
    ),
    request<{ items: AcademicEntitySummary[]; totalElements: number }>(
      gatewayUrl,
      `/api/v1/web/entities${page}`,
      token,
      fetchImpl,
    ),
    request<{ items: CommunitySummary[]; totalElements: number }>(
      gatewayUrl,
      `/api/v1/web/communities${page}`,
      token,
      fetchImpl,
    ),
  ]);

  return { university, departments, entities, communities };
}
