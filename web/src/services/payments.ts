import { parseApiError } from "../utils/apiError.js";

export interface PaymentCharge {
  chargeId: string;
  referenceType: string;
  origin?: "EVENT" | "SPORTS_TEAM" | "SPORTS_FREE_AGENT" | "UNKNOWN";
  title?: string;
  subtitle?: string;
  targetPath?: string;
  referenceId: string;
  payerUserId: string;
  amountMinor: number;
  currency: string;
  status: string;
  provider: string;
  pixCopyPaste?: string;
  createdAt: string;
  expiresAt?: string;
  paidAt?: string;
  refundedAt?: string;
}

export class PaymentApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `Gateway respondeu com status ${status}.`);
    this.name = "PaymentApiError";
  }
}

function gatewayUrl(value?: string): string {
  return value ?? import.meta.env.VITE_GATEWAY_URL ?? "";
}

async function request<T>(
  path: string,
  token: string,
  baseUrl: string,
  fetchImpl: typeof globalThis.fetch,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const parsed = await parseApiError(response);
    throw new PaymentApiError(response.status, parsed.message);
  }
  return (await response.json()) as T;
}

export function getMyPayments(
  token: string,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ items: PaymentCharge[] }> {
  return request<{ items: PaymentCharge[] }>("/api/v1/web/payments/me", token, gatewayUrl(baseUrl), fetchImpl);
}

export function confirmSimulatedPayment(
  token: string,
  registrationId: string,
  baseUrl?: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ chargeId: string; registrationId: string; paidAt: string }> {
  return request<{ chargeId: string; registrationId: string; paidAt: string }>(
    `/api/v1/web/payments/${encodeURIComponent(registrationId)}/confirm`,
    token,
    gatewayUrl(baseUrl),
    fetchImpl,
    "POST",
    {},
  );
}

export async function findPendingPaymentCharge(
  token: string,
  matcher: { referenceId?: string | null; targetPath?: string | null },
  attempts = 5,
  delayMs = 500,
): Promise<PaymentCharge | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await getMyPayments(token);
    const match = response.items.find(
      (charge) =>
        charge.status === "PENDING" &&
        ((matcher.referenceId && charge.referenceId === matcher.referenceId) ||
          (matcher.targetPath && charge.targetPath === matcher.targetPath)),
    );
    if (match) return match;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}
