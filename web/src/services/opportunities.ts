import { parseApiError } from "../utils/apiError.js";

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  publisherType: string;
  publisherId: string;
  category: string;
  deadline?: string | null;
  externalUrl: string;
  imageUrl?: string | null;
  createdAt: string;
  status: string;
  available?: boolean;
  canManage?: boolean;
  canClose?: boolean;
  canReactivate?: boolean;
}

export interface OpportunityPage {
  items: Opportunity[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface OpportunityFilters {
  page: number;
  size: number;
  q?: string;
  category?: string;
  publisherType?: string;
}

export interface OpportunityPublisherContext {
  publisherType: "PROFESSOR" | "DEPARTMENT" | "ACADEMIC_ENTITY";
  publisherId: string;
  name: string;
}

export interface ProfessorVerificationRequest {
  id: string;
  title: string;
  requesterName: string | null;
  targetDepartmentId: string;
  targetDepartmentName?: string | null;
  payload: { identifier?: string };
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

export interface CreateOpportunityInput {
  title: string;
  description: string;
  publisherType: OpportunityPublisherContext["publisherType"];
  publisherId: string;
  category: string;
  deadline: string | null;
  externalUrl: string;
  imageUrl?: string | null;
}

export interface UpdateOpportunityInput {
  title?: string;
  description?: string;
  category?: string;
  deadline?: string | null;
  clearDeadline?: boolean;
  externalUrl?: string;
  imageUrl?: string | null;
  clearImageUrl?: boolean;
  status?: "ACTIVE" | "CLOSED";
  reactivate?: boolean;
}

export class OpportunityApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `Gateway respondeu com status ${status}.`);
    this.name = "OpportunityApiError";
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
    throw new OpportunityApiError(response.status, parsed.message);
  }
  return (await response.json()) as T;
}

export function getOpportunities(
  token: string,
  filters: OpportunityFilters,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<OpportunityPage> {
  const query = new URLSearchParams({ page: String(filters.page), size: String(filters.size) });
  for (const key of ["q", "category", "publisherType"] as const) {
    const value = filters[key]?.trim();
    if (value) query.set(key, value);
  }
  return request<OpportunityPage>(`/api/v1/web/opportunities?${query.toString()}`, token, gatewayUrl, fetchImpl);
}

export function getOpportunity(
  token: string,
  opportunityId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Opportunity> {
  return request<Opportunity>(
    `/api/v1/web/opportunities/${encodeURIComponent(opportunityId)}`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function getOpportunityPublisherContexts(
  token: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ items: OpportunityPublisherContext[] }> {
  return request("/api/v1/web/opportunities/publisher-contexts", token, gatewayUrl, fetchImpl);
}

export function createOpportunity(
  token: string,
  payload: CreateOpportunityInput,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Opportunity> {
  return request("/api/v1/web/opportunities", token, gatewayUrl, fetchImpl, "POST", payload);
}

export function getManagedOpportunities(
  token: string,
  page = 0,
  size = 20,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<OpportunityPage> {
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  return request<OpportunityPage>(
    `/api/v1/web/opportunities/managed?${query.toString()}`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function updateOpportunity(
  token: string,
  opportunityId: string,
  payload: UpdateOpportunityInput,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Opportunity> {
  return request<Opportunity>(
    `/api/v1/web/opportunities/${encodeURIComponent(opportunityId)}`,
    token,
    gatewayUrl,
    fetchImpl,
    "PATCH",
    payload,
  );
}

export function closeOpportunity(
  token: string,
  opportunityId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<Opportunity> {
  return request<Opportunity>(
    `/api/v1/web/opportunities/${encodeURIComponent(opportunityId)}`,
    token,
    gatewayUrl,
    fetchImpl,
    "DELETE",
  );
}

export function createProfessorVerificationRequest(
  token: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<ProfessorVerificationRequest> {
  return request("/api/v1/web/professor-verification-requests", token, gatewayUrl, fetchImpl, "POST", {});
}

export function getMyProfessorVerificationRequests(
  token: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ items: ProfessorVerificationRequest[] }> {
  return request("/api/v1/web/professor-verification-requests/me", token, gatewayUrl, fetchImpl);
}

export function getProfessorVerificationRequests(
  token: string,
  departmentId: string,
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ items: ProfessorVerificationRequest[] }> {
  return request(
    `/api/v1/web/departments/${encodeURIComponent(departmentId)}/professor-verification-requests`,
    token,
    gatewayUrl,
    fetchImpl,
  );
}

export function reviewProfessorVerificationRequest(
  token: string,
  requestId: string,
  decision: "approve" | "reject",
  gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "",
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<ProfessorVerificationRequest> {
  return request(
    `/api/v1/web/professor-verification-requests/${encodeURIComponent(requestId)}/${decision}`,
    token,
    gatewayUrl,
    fetchImpl,
    "POST",
  );
}
