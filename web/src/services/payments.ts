export interface PaymentCharge {
  chargeId: string;
  referenceType: string;
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
    let message: string | undefined;
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      message = payload.error ?? payload.message;
    } catch {
      // Ignore non-JSON body
    }
    throw new PaymentApiError(response.status, message);
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
