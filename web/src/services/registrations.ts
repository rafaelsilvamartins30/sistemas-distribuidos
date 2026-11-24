import { parseApiError } from "../utils/apiError.js";
import type { Event } from "./events.js";

export type RegistrationStatus =
  "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED_BY_USER" | "PAYMENT_FAILED" | "PAYMENT_EXPIRED" | "CANCELLED_BY_EVENT";

export interface Registration {
  id: string;
  eventId: string;
  userId: string;
  status: RegistrationStatus;
  registeredAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  canCancel: boolean;
  cancellationBlockedReason: string | null;
  paymentDeadlineAt: string | null;
  reservationExpiresAt: string | null;
  event: Event;
}

export interface RegistrationPage {
  items: Registration[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export class RegistrationApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail || `Gateway respondeu com status ${status}.`);
    this.name = "RegistrationApiError";
  }
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  token: string,
  gatewayUrl: string,
  fetchImpl: typeof globalThis.fetch,
): Promise<T> {
  const response = await fetchImpl(`${gatewayUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const parsed = await parseApiError(response);
    throw new RegistrationApiError(response.status, parsed.message);
  }
  return (await response.json()) as T;
}

export function getMyRegistrations(
  token: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<RegistrationPage> {
  return request("GET", "/api/v1/web/me/activities?page=0&size=100", token, gatewayUrl, fetchImpl);
}

export async function getMyEventRegistration(
  token: string,
  eventId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Registration | null> {
  const query = new URLSearchParams({ page: "0", size: "1", eventId });
  const page = await request<RegistrationPage>(
    "GET",
    `/api/v1/web/me/activities?${query}`,
    token,
    gatewayUrl,
    fetchImpl,
  );
  return page.items[0] ?? null;
}

export function registerForEvent(
  token: string,
  eventId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Registration> {
  return request(
    "POST",
    `/api/v1/web/events/${encodeURIComponent(eventId)}/registrations`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function cancelRegistration(
  token: string,
  registrationId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Registration> {
  return request(
    "DELETE",
    `/api/v1/web/registrations/${encodeURIComponent(registrationId)}`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}
