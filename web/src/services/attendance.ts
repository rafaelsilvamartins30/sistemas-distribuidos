export type AttendanceEntryStatus = "ELIGIBLE" | "CANCELLED" | "ATTENDED" | "NO_SHOW";

export interface MyAttendance {
  eventId: string;
  sessionId: string;
  attendanceEntryId: string;
  status: AttendanceEntryStatus;
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
  status: AttendanceEntryStatus;
}

export class AttendanceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail || `Gateway respondeu com status ${status}.`);
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
    let detail = `Gateway respondeu com status ${response.status}.`;
    try {
      const problem = (await response.json()) as { detail?: unknown; error?: unknown };
      if (typeof problem.detail === "string") detail = problem.detail;
      else if (typeof problem.error === "string") detail = problem.error;
    } catch {
      // The HTTP status is enough when the upstream does not return JSON.
    }
    throw new AttendanceApiError(response.status, detail);
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
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<TicketPage> {
  return request("GET", "/api/v1/web/me/tickets", token, gatewayUrl, fetchImpl);
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
