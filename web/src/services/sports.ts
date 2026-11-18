export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Sport {
  id: string;
  name: string;
  playersOnField: number;
  minimumRoster: number;
  maximumRoster: number;
  allowsDraw: boolean;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  defaultForfeitScore: number;
  rulesMarkdown: string;
  createdByType: string;
  createdById: string;
  status: string | null;
}

export interface Competition {
  id: string;
  title: string;
  sportId: string;
  sportName: string;
  skillLevel: string;
  organizerType: string;
  organizerId: string;
  targetTeamCount: number;
  rosterMin: number;
  rosterMax: number;
  tieBreakers: string[];
  teamEntryPrice: number;
  freeAgentPrice: number;
  registrationDeadline: string;
  drawSeed: number | null;
  status: string | null;
  format: string;
}

export interface Season {
  id: string;
  title: string;
  sportId: string;
  sportName: string;
  skillLevel: string;
  organizerType: string;
  organizerId: string;
  targetTeamCount: number;
  rosterMin: number;
  rosterMax: number;
  tieBreakers: string[];
  teamEntryPrice: number;
  freeAgentPrice: number;
  registrationDeadline: string;
  status: string | null;
  roundRobinMode: "double round-robin" | "single round-robin";
}

export interface SportsFilters {
  page?: number;
  size?: number;
  q?: string;
  sportId?: string;
  skillLevel?: string;
  organizerType?: string;
  organizerId?: string;
  targetTeamCount?: number;
}

export class SportsApiError extends Error {
  constructor(public readonly status: number) {
    super(`Gateway respondeu com status ${status}.`);
    this.name = "SportsApiError";
  }
}

function queryString(filters: SportsFilters = {}): string {
  const params = new URLSearchParams();
  params.set("page", String(filters.page ?? 0));
  params.set("size", String(filters.size ?? 20));
  for (const key of ["q", "sportId", "skillLevel", "organizerType", "organizerId"] as const) {
    const value = filters[key]?.trim();
    if (value) params.set(key, value);
  }
  if (filters.targetTeamCount !== undefined) params.set("targetTeamCount", String(filters.targetTeamCount));
  return params.toString();
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
  if (!response.ok) throw new SportsApiError(response.status);
  return (await response.json()) as T;
}

function gatewayUrl(value?: string): string {
  return value ?? import.meta.env.VITE_GATEWAY_URL ?? "";
}

export function getSports(
  token: string,
  filters: SportsFilters = {},
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Page<Sport>> {
  return request<Page<Sport>>(`/api/v1/web/sports?${queryString(filters)}`, token, gatewayUrl(baseUrl), fetchImpl);
}

export function getSport(
  token: string,
  id: string,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Sport> {
  return request<Sport>(`/api/v1/web/sports/${encodeURIComponent(id)}`, token, gatewayUrl(baseUrl), fetchImpl);
}

export function getCompetitions(
  token: string,
  filters: SportsFilters = {},
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Page<Competition>> {
  return request<Page<Competition>>(
    `/api/v1/web/competitions?${queryString(filters)}`,
    token,
    gatewayUrl(baseUrl),
    fetchImpl,
  );
}

export function getCompetition(
  token: string,
  id: string,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Competition> {
  return request<Competition>(
    `/api/v1/web/competitions/${encodeURIComponent(id)}`,
    token,
    gatewayUrl(baseUrl),
    fetchImpl,
  );
}

export function getSeasons(
  token: string,
  filters: SportsFilters = {},
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Page<Season>> {
  return request<Page<Season>>(`/api/v1/web/seasons?${queryString(filters)}`, token, gatewayUrl(baseUrl), fetchImpl);
}

export function getSeason(
  token: string,
  id: string,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Season> {
  return request<Season>(`/api/v1/web/seasons/${encodeURIComponent(id)}`, token, gatewayUrl(baseUrl), fetchImpl);
}
