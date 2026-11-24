import { parseApiError } from "../utils/apiError.js";

export interface SportsAdminPage<T> {
  items: T[];
  totalElements: number;
}

export interface SportsAdminSport {
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
}

export interface SportsAdminEvent {
  id: string;
  title: string;
  sportId: string;
  sportName: string;
  organizerType: string;
  organizerId: string;
  targetTeamCount: number;
  rosterMin: number;
  rosterMax: number;
  teamEntryPrice: number;
  freeAgentPrice: number;
  registrationDeadline: string;
  status: string | null;
  format?: string;
  roundRobinMode?: string;
}

export interface SportsAdminOrganizer {
  organizerType: string;
  organizerId: string;
  name: string;
}

export interface SportsAdminMatch {
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
  status: string;
  checkinCount: number;
  checkinToken: string | null;
  viewerCanEditScore: boolean;
  viewerCanManageQr: boolean;
  viewerCanReviewAttendance: boolean;
}

export interface SportsAdminTeamMember {
  id: string;
  userId: string | null;
  displayName: string;
  role: "CAPTAIN" | "MEMBER" | "FREE_AGENT";
  joinedAt: string;
}

export interface SportsAdminTeam {
  id: string;
  name: string;
  captainUserId: string;
  status: string;
  createdAt: string;
  inviteCode: string | null;
  inviteExpiresAt: string | null;
  reservedPlayerCount: number | null;
  inviteActive: boolean;
  placeholder: boolean;
  rosterComplete: boolean;
  members: SportsAdminTeamMember[];
}

export interface SportsAdminFreeAgent {
  id: string;
  userId: string;
  displayName: string;
  allocatedTeamId: string | null;
  status: "QUEUED" | "ALLOCATED";
  registeredAt: string;
}

export interface SportsAdminOverview {
  contextType: "COMPETITION" | "SEASON";
  contextId: string;
  title: string;
  targetTeamCount: number;
  rosterMin: number;
  rosterMax: number;
  registrationDeadline: string;
  status: string | null;
  teams: SportsAdminTeam[];
  freeAgents: SportsAdminFreeAgent[];
  matches: SportsAdminMatch[];
  championTeamId: string | null;
  manualChampionCandidates: string[];
  canGenerateMatches: boolean;
}

export interface SportsAdminCatalog {
  sports: SportsAdminPage<SportsAdminSport>;
  organizerContexts: { items: SportsAdminOrganizer[] };
  competitions: SportsAdminPage<SportsAdminEvent>;
  seasons: SportsAdminPage<SportsAdminEvent>;
}

export class SportsAdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SportsAdminApiError";
  }
}

async function request<T>(
  gatewayUrl: string,
  token: string,
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: unknown,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const parsed = await parseApiError(response, `Falha na gestão esportiva (${response.status}).`);
    throw new SportsAdminApiError(response.status, parsed.message, parsed.code);
  }
  return (await response.json()) as T;
}

export function getSportsAdminCatalog(
  gatewayUrl: string,
  token: string,
  section: string,
  page: number,
): Promise<SportsAdminCatalog> {
  const query = new URLSearchParams({ section, page: String(page) });
  return request<SportsAdminCatalog>(gatewayUrl, token, `/api/v1/admin/sports/catalog?${query}`, "GET");
}

export function getSportsAdminOverview(
  gatewayUrl: string,
  token: string,
  contextType: string,
  contextId: string,
): Promise<SportsAdminOverview> {
  return request(
    gatewayUrl,
    token,
    `/api/v1/admin/sports-events/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}/overview`,
  );
}

export function createAdminSport(gatewayUrl: string, token: string, payload: Record<string, unknown>) {
  return request<SportsAdminSport>(gatewayUrl, token, "/api/v1/admin/sports", "POST", payload);
}

export function createAdminCompetition(gatewayUrl: string, token: string, payload: Record<string, unknown>) {
  return request<SportsAdminEvent>(gatewayUrl, token, "/api/v1/admin/competitions", "POST", payload);
}

export function createAdminSeason(gatewayUrl: string, token: string, payload: Record<string, unknown>) {
  return request<SportsAdminEvent>(gatewayUrl, token, "/api/v1/admin/seasons", "POST", payload);
}

export function updateAdminSportsEvent(
  gatewayUrl: string,
  token: string,
  contextType: string,
  contextId: string,
  changes: { registrationDeadline: string } | { championTeamId: string },
) {
  return request(
    gatewayUrl,
    token,
    `/api/v1/admin/sports-events/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}`,
    "PATCH",
    changes,
  );
}

export function cancelAdminSportsEvent(gatewayUrl: string, token: string, contextType: string, contextId: string) {
  return request(
    gatewayUrl,
    token,
    `/api/v1/admin/sports-events/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}/cancel`,
    "POST",
  );
}

export function generateAdminSportsMatches(
  gatewayUrl: string,
  token: string,
  contextType: string,
  contextId: string,
  payload: { firstMatchAt: string; location: string },
) {
  return request<SportsAdminMatch[]>(
    gatewayUrl,
    token,
    `/api/v1/admin/sports-events/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}/matches/generate`,
    "POST",
    payload,
  );
}

export function saveAdminSportsScore(
  gatewayUrl: string,
  token: string,
  matchId: string,
  payload: { homeScore: number; awayScore: number; homePenaltyScore?: number; awayPenaltyScore?: number },
) {
  return request<SportsAdminMatch>(
    gatewayUrl,
    token,
    `/api/v1/admin/sports-matches/${encodeURIComponent(matchId)}/score`,
    "PATCH",
    payload,
  );
}

export function createAdminSportsCheckinToken(gatewayUrl: string, token: string, matchId: string) {
  return request<{ matchId: string; checkinToken: string }>(
    gatewayUrl,
    token,
    `/api/v1/admin/sports-matches/${encodeURIComponent(matchId)}/checkin-token`,
    "POST",
  );
}

export interface MatchAttendance {
  entries: { name: string; checkedInAt: string }[];
  closedAt: string | null;
}

export function reviewAdminMatchAttendance(gatewayUrl: string, token: string, matchId: string, close = false) {
  return request<MatchAttendance>(
    gatewayUrl,
    token,
    `/api/v1/admin/sports-matches/${encodeURIComponent(matchId)}/attendance`,
    close ? "POST" : "GET",
  );
}
