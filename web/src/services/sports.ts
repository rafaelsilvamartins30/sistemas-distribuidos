import { parseApiError } from "../utils/apiError.js";

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
  teamEntryPrice: number;
  freeAgentPrice: number;
  registrationDeadline: string;
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
  teamEntryPrice: number;
  freeAgentPrice: number;
  registrationDeadline: string;
  status: string | null;
  roundRobinMode: "double round-robin" | "single round-robin";
}

export type SportsContextType = "COMPETITION" | "SEASON";

export interface SportsTeamMember {
  id: string;
  userId: string | null;
  displayName: string;
  role: "CAPTAIN" | "MEMBER" | "FREE_AGENT";
  joinedAt: string;
}

export interface SportsTeam {
  id: string;
  name: string;
  captainUserId: string;
  status: string;
  createdAt: string;
  inviteCode?: string | null;
  inviteExpiresAt?: string | null;
  reservedPlayerCount?: number | null;
  inviteActive?: boolean;
  placeholder?: boolean;
  members: SportsTeamMember[];
}

export interface SportsFreeAgent {
  id: string;
  userId: string;
  displayName: string;
  allocatedTeamId: string | null;
  status: "QUEUED" | "ALLOCATED";
  registeredAt: string;
}

export interface SportsFreeAgentRegistrationResult {
  status: "PENDING_PAYMENT" | "QUEUED" | "ALLOCATED";
  teamId: string | null;
  teamName: string | null;
}

export interface SportsMatch {
  id: string;
  roundNumber: number;
  roundLabel?: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  scheduledAt: string;
  location: string;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
  status: "SCHEDULED" | "COMPLETED";
  checkinCount: number;
  viewerCheckedIn: boolean;
  hasCheckinToken: boolean;
  viewerCanCheckIn?: boolean;
  checkinToken: string | null;
}

export interface SportsStandingGroup {
  groupName: string;
  rows: {
    teamId: string;
    teamName: string;
    rank: number;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDiff: number;
    points: number;
    qualified: boolean;
  }[];
}

export interface SportsEventOverview {
  contextType: SportsContextType;
  contextId: string;
  title: string;
  skillLevel: string;
  organizerType: string;
  organizerId: string;
  targetTeamCount: number;
  rosterMin: number;
  rosterMax: number;
  teamEntryPrice: number;
  freeAgentPrice: number;
  registrationDeadline: string;
  formatOrMode: string;
  status: string | null;
  sport: Sport;
  teams: SportsTeam[];
  freeAgents: SportsFreeAgent[];
  matches: SportsMatch[];
  standings: SportsStandingGroup[];
  knockoutTies?: {
    round: number;
    firstMatchId: string;
    secondMatchId: string | null;
    homeAggregate: number;
    awayAggregate: number;
    winnerTeamId: string | null;
  }[];
  phase: "INSCRICAO" | "ROLANDO" | "FINALIZADO" | "CANCELADO";
  championTeamId: string | null;
  viewerCanManage: boolean;
  viewerTeamId: string | null;
  viewerFreeAgentQueued: boolean;
  viewerPendingPayment: boolean;
  viewerCanEnroll?: boolean;
}

export interface MySportsEnrollment {
  contextType: SportsContextType;
  contextId: string;
  title: string;
  sportName: string;
  skillLevel: string;
  enrollmentRole: "TEAM" | "FREE_AGENT_QUEUED";
  teamName: string | null;
  registrationDeadline: string;
  firstMatchAt?: string | null;
}

export interface MySportsMatch {
  matchId: string;
  contextType: SportsContextType;
  contextId: string;
  eventTitle: string;
  sportName: string;
  roundNumber: number;
  teamId: string;
  teamName: string;
  opponentName: string;
  scheduledAt: string;
  location: string;
  homeScore: number | null;
  awayScore: number | null;
  homePenaltyScore?: number | null;
  awayPenaltyScore?: number | null;
  status: "SCHEDULED" | "COMPLETED";
  hasCheckinToken: boolean;
  viewerCheckedIn: boolean;
}

export interface SportsFilters {
  q?: string;
  sportId?: string;
  skillLevel?: string;
  organizerType?: string;
  organizerId?: string;
  targetTeamCount?: number;
  page?: number;
  size?: number;
}

export class SportsApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `Gateway respondeu com status ${status}.`);
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
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const parsed = await parseApiError(response);
    throw new SportsApiError(response.status, parsed.message);
  }
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

export function getSportsEventOverview(
  token: string,
  contextType: SportsContextType,
  contextId: string,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<SportsEventOverview> {
  return request<SportsEventOverview>(
    `/api/v1/web/sports-events/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}/overview`,
    token,
    gatewayUrl(baseUrl),
    fetchImpl,
  );
}

export function registerSportsTeam(
  token: string,
  contextType: SportsContextType,
  contextId: string,
  payload: { name: string; captainName?: string; memberNames?: string[]; reservedPlayerCount?: number },
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<SportsTeam> {
  return request<SportsTeam>(
    `/api/v1/web/sports-events/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}/teams`,
    token,
    gatewayUrl(baseUrl),
    fetchImpl,
    "POST",
    payload,
  );
}

export function joinSportsTeamByCode(
  token: string,
  contextType: SportsContextType,
  contextId: string,
  payload: { inviteCode: string; displayName?: string },
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<SportsTeam> {
  return request<SportsTeam>(
    `/api/v1/web/sports-events/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}/teams/join`,
    token,
    gatewayUrl(baseUrl),
    fetchImpl,
    "POST",
    payload,
  );
}

export function registerSportsFreeAgent(
  token: string,
  contextType: SportsContextType,
  contextId: string,
  payload: { displayName?: string } = {},
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<SportsFreeAgentRegistrationResult> {
  return request<SportsFreeAgentRegistrationResult>(
    `/api/v1/web/sports-events/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}/free-agents`,
    token,
    gatewayUrl(baseUrl),
    fetchImpl,
    "POST",
    payload,
  );
}

export function checkInSportsMatch(
  token: string,
  matchId: string,
  checkinToken: string,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ id: string; matchId: string; teamId: string; userId: string; checkedInAt: string }> {
  return request<{ id: string; matchId: string; teamId: string; userId: string; checkedInAt: string }>(
    `/api/v1/web/sports-matches/${encodeURIComponent(matchId)}/checkins`,
    token,
    gatewayUrl(baseUrl),
    fetchImpl,
    "POST",
    { token: checkinToken },
  );
}

export function getMySportsMatches(
  token: string,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ items: MySportsMatch[] }> {
  return request<{ items: MySportsMatch[] }>("/api/v1/web/sports-matches/me", token, gatewayUrl(baseUrl), fetchImpl);
}

export function getMySportsEnrollments(
  token: string,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ items: MySportsEnrollment[] }> {
  return request<{ items: MySportsEnrollment[] }>(
    "/api/v1/web/sports-events/me",
    token,
    gatewayUrl(baseUrl),
    fetchImpl,
  );
}
