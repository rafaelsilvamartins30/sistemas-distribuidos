import { parseApiError } from "../utils/apiError.js";

export type EventStatus = "ACTIVE" | "CANCELLED";
export type RegistrationMode = "INTERNAL_FREE" | "INTERNAL_PAID" | "EXTERNAL_PAID";
export type AttendanceMode = "PARTICIPANT_SCANS_EVENT" | "ORGANIZER_SCANS_PARTICIPANT";
export type OrganizerType =
  "PROFESSOR" | "DEPARTMENT" | "ACADEMIC_UNIT" | "UNIVERSITY" | "ACADEMIC_ENTITY" | "COMMUNITY";

export interface Event {
  id: string;
  title: string;
  description: string;
  organizerType: string;
  organizerId: string;
  createdByUserId?: string | null;
  imageUrl?: string | null;
  location: string;
  startsAt: string;
  endsAt: string;
  category: string;
  capacity?: number | null;
  registrationDeadline: string;
  registrationMode: RegistrationMode;
  /** Amount in minor units. */
  price?: number | null;
  externalUrl?: string | null;
  attendanceEnabled: boolean;
  attendanceMode?: AttendanceMode | null;
  status: EventStatus;
  createdAt: string;
  viewerCanManage?: boolean;
  registrationBlockedReason?: string | null;
  _links?: Partial<Record<"update" | "cancel", { href: string; method: string }>>;
}

export interface EventPage {
  items: Event[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface EventOrganizerContext {
  organizerType: OrganizerType;
  organizerId: string;
  name: string;
  paidRegistrationMode: Exclude<RegistrationMode, "INTERNAL_FREE">;
}

export interface CreateEventInput {
  title: string;
  description: string;
  organizerType: OrganizerType;
  organizerId: string;
  imageUrl?: string | null;
  location: string;
  startsAt: string;
  endsAt: string;
  category: string;
  capacity?: number | null;
  registrationDeadline: string;
  registrationMode: RegistrationMode;
  price?: number | null;
  externalUrl?: string | null;
  attendanceEnabled?: boolean;
  attendanceMode?: AttendanceMode | null;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  imageUrl?: string | null;
  clearImageUrl?: boolean;
  location?: string;
  startsAt?: string;
  endsAt?: string;
  category?: string;
  capacity?: number | null;
  clearCapacity?: boolean;
  registrationDeadline?: string;
  registrationMode?: RegistrationMode;
  price?: number | null;
  clearPrice?: boolean;
  externalUrl?: string | null;
  clearExternalUrl?: boolean;
  attendanceEnabled?: boolean;
  attendanceMode?: AttendanceMode | null;
}

export class EventApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    message?: string,
  ) {
    super(message ?? `Gateway respondeu com status ${status}.`);
    this.name = "EventApiError";
  }
}

async function request<T>(
  path: string,
  token: string,
  gatewayUrl: string,
  fetchImpl: typeof globalThis.fetch,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const parsed = await parseApiError(response);
    throw new EventApiError(response.status, parsed.code, parsed.message);
  }
  return (await response.json()) as T;
}

export function getEvents(
  token: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<EventPage> {
  return request<EventPage>("/api/v1/web/events?page=0&size=20", token, gatewayUrl, fetchImpl);
}

export function getEvent(
  token: string,
  eventId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Event> {
  return request<Event>(`/api/v1/web/events/${encodeURIComponent(eventId)}`, token, gatewayUrl, fetchImpl);
}

export function getEventOrganizerContexts(
  token: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ items: EventOrganizerContext[] }> {
  return request("/api/v1/web/events/organizer-contexts", token, gatewayUrl, fetchImpl);
}

export function getManagedEvents(
  token: string,
  page = 0,
  size = 20,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<EventPage> {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  return request<EventPage>(`/api/v1/web/events/managed?${query.toString()}`, token, gatewayUrl, fetchImpl);
}

export function createEvent(
  token: string,
  payload: CreateEventInput,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Event> {
  return request<Event>("/api/v1/web/events", token, gatewayUrl, fetchImpl, "POST", payload);
}

export function updateEvent(
  token: string,
  eventId: string,
  payload: UpdateEventInput,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Event> {
  return request<Event>(
    `/api/v1/web/events/${encodeURIComponent(eventId)}`,
    token,
    gatewayUrl,
    fetchImpl,
    "PATCH",
    payload,
  );
}

export function cancelEvent(
  token: string,
  eventId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Event> {
  return request<Event>(`/api/v1/web/events/${encodeURIComponent(eventId)}`, token, gatewayUrl, fetchImpl, "DELETE");
}
