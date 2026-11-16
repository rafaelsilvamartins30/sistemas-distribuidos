export type EventStatus = "ACTIVE" | "CANCELLED";
export type RegistrationMode = "INTERNAL_FREE" | "INTERNAL_PAID" | "EXTERNAL_PAID";
export type AttendanceMode = "PARTICIPANT_SCANS_EVENT" | "ORGANIZER_SCANS_PARTICIPANT";

export interface Event {
  id: string;
  title: string;
  description: string;
  organizerType: string;
  organizerId: string;
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
}

export interface EventPage {
  items: Event[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export class EventApiError extends Error {
  constructor(public readonly status: number) {
    super(`Gateway respondeu com status ${status}.`);
    this.name = "EventApiError";
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
  if (!response.ok) throw new EventApiError(response.status);
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
