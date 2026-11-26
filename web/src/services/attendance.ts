import { parseApiError } from "../utils/apiError.js";

export type AttendanceEntryStatus = "ELIGIBLE" | "CANCELLED" | "ATTENDED" | "NO_SHOW";

export type ParticipantAttendanceAction = "SCAN_EVENT_QR" | "GENERATE_PARTICIPANT_QR";

export interface MyAttendance {
  eventId: string;
  sessionId: string;
  attendanceEntryId: string;
  status: AttendanceEntryStatus;
  action?: ParticipantAttendanceAction | null;
  checkInOpensAt?: string | null;
  checkInClosesAt?: string | null;
  registeredAt: string;
  checkedAt: string | null;
}

export interface CheckInResult {
  checkInId: string;
  sessionId: string;
  attendanceEntryId: string;
  status: "ATTENDED";
  checkedAt: string;
}

export interface MyTicket extends MyAttendance {
  registrationId: string | null;
  eventTitle: string;
  startsAt: string;
  endsAt: string;
  mode: "PARTICIPANT_SCANS_EVENT" | "ORGANIZER_SCANS_PARTICIPANT";
}

export interface TicketRegistration {
  id: string;
  eventId: string;
  userId: string;
  status: string;
  registeredAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  canCancel: boolean;
  cancellationBlockedReason: string | null;
  event: {
    id: string;
    title: string;
    description: string;
    organizerType: string;
    organizerId: string;
    imageUrl: string | null;
    location: string;
    startsAt: string;
    endsAt: string;
    category: string;
    registrationMode: "INTERNAL_FREE" | "INTERNAL_PAID" | "EXTERNAL_PAID";
    attendanceEnabled: boolean;
    attendanceMode: MyTicket["mode"] | null;
  };
  attendance: MyTicket | null;
}

export interface TicketPage {
  items: TicketRegistration[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface QrArtifact {
  token: string;
  qrSvg: string;
}

export interface OrganizerCheckInPreview {
  eventId: string;
  eventTitle: string;
  attendanceEntryId: string;
  registrationId: string | null;
  participantUserId: string;
  participantName?: string | null;
  status: AttendanceEntryStatus;
}

const ATTENDANCE_ERROR_MESSAGES: Record<string, string> = {
  "Check-in is outside the allowed window": "A lista de presença deste evento não está aberta para check-in.",
  "QR token is invalid": "Código QR inválido ou expirado. Peça ou gere um novo código.",
  "Attendance session is closed or unavailable":
    "A lista de presença deste evento já foi fechada ou o evento foi cancelado.",
  "Participant is not eligible for this event":
    "Este participante não possui inscrição confirmada elegível para o evento.",
  "Attendance entry is not eligible": "Esta inscrição não está mais elegível para registro de presença.",
  "Only the recorded event creator can manage attendance":
    "Apenas o criador registrado do evento pode gerenciar a presença e o QR Code.",
  "Check-in could not be saved": "Não foi possível salvar a presença agora. Tente novamente em instantes.",
  "Attendance is unavailable": "O serviço de presença está temporariamente indisponível.",
};

export function translateAttendanceError(detail: string): string {
  const normalized = detail.trim();
  return ATTENDANCE_ERROR_MESSAGES[normalized] ?? normalized;
}

export class AttendanceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(translateAttendanceError(detail || `Gateway respondeu com status ${status}.`));
    this.name = "AttendanceApiError";
  }
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  token: string,
  gatewayUrl: string,
  fetchImpl: typeof globalThis.fetch,
  body?: unknown,
): Promise<T> {
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const parsed = await parseApiError(response);
    throw new AttendanceApiError(response.status, translateAttendanceError(parsed.message));
  }
  return (await response.json()) as T;
}

export function getMyAttendance(
  token: string,
  eventId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<MyAttendance> {
  return request(
    "GET",
    `/api/v1/web/attendance/me?eventId=${encodeURIComponent(eventId)}`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function checkInWithEventQr(
  token: string,
  qrToken: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CheckInResult> {
  return request("POST", "/api/v1/web/attendance/check-ins", token, gatewayUrl, fetchImpl, { token: qrToken });
}

export function getMyTickets(
  token: string,
  filters: { page: number; agenda: "upcoming" | "past" | "cancelled"; startOn?: string; endOn?: string },
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<TicketPage> {
  const query = new URLSearchParams({ page: String(filters.page), agenda: filters.agenda, size: "20" });
  if (filters.startOn) query.set("startOn", filters.startOn);
  if (filters.endOn) query.set("endOn", filters.endOn);
  return request("GET", `/api/v1/web/me/tickets?${query}`, token, gatewayUrl, fetchImpl);
}

export function issueMyTicketQr(
  token: string,
  eventId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<QrArtifact> {
  return request(
    "POST",
    `/api/v1/web/attendance/tickets/${encodeURIComponent(eventId)}/qr`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export type OrganizerAttendanceAction = "GENERATE_EVENT_QR" | "SCAN_PARTICIPANT_QR" | "REVIEW_ATTENDANCE";

export interface OrganizerAttendanceActionInfo {
  action: OrganizerAttendanceAction | null;
  checkInOpensAt?: string | null;
  checkInClosesAt?: string | null;
}

export function getOrganizerAttendanceAction(
  token: string,
  eventId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<OrganizerAttendanceActionInfo> {
  return request(
    "GET",
    `/api/v1/web/attendance/events/${encodeURIComponent(eventId)}/organizer-action`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function issueEventAttendanceQr(
  token: string,
  eventId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<QrArtifact> {
  return request(
    "POST",
    `/api/v1/web/attendance/events/${encodeURIComponent(eventId)}/qr`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function previewOrganizerCheckIn(
  token: string,
  qrToken: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<OrganizerCheckInPreview> {
  return request("POST", "/api/v1/web/attendance/organizer-check-ins/preview", token, gatewayUrl, fetchImpl, {
    token: qrToken,
  });
}

export function confirmOrganizerCheckIn(
  token: string,
  qrToken: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<CheckInResult> {
  return request("POST", "/api/v1/web/attendance/organizer-check-ins/confirm", token, gatewayUrl, fetchImpl, {
    token: qrToken,
  });
}

export interface EventAttendanceReview {
  entries: { userId: string; name?: string; checkedInAt: string }[];
  closedAt: string | null;
}

export function reviewEventAttendance(token: string, eventId: string, close = false): Promise<EventAttendanceReview> {
  return request(
    close ? "POST" : "GET",
    `/api/v1/web/attendance/events/${encodeURIComponent(eventId)}/attendance-review`,
    token,
    import.meta.env.VITE_GATEWAY_URL ?? "",
    globalThis.fetch,
  );
}
