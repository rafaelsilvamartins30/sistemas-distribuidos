export type AffiliationStatus = "STUDENT" | "PROFESSOR" | "ALUMNI";
export type AcademicLevel = "UNDERGRADUATE" | "MASTERS" | "DOCTORATE";

export interface AdminProfile {
  id: string;
  name: string;
  institutionalId: string;
  affiliationStatus: AffiliationStatus | null;
  academicLevel: AcademicLevel | null;
  course: string;
  department: string;
  interests: string[];
  createdAt: string;
  updatedAt: string;
  email?: string | null;
  emailVerified?: boolean | null;
}

export class AdminApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export interface TokenPayload {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  realm_access?: {
    roles?: unknown[];
  };
}

export function extractRoles(tokenParsed: TokenPayload | undefined): string[] {
  const roles = tokenParsed?.realm_access?.roles;
  if (!Array.isArray(roles)) {
    return [];
  }

  return roles.filter((role): role is string => typeof role === "string");
}

export function hasPlatformAdminRole(tokenParsed: TokenPayload | undefined): boolean {
  return extractRoles(tokenParsed).includes("PLATFORM_ADMIN");
}

export async function fetchAdminProfile(
  gatewayUrl: string,
  token: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<AdminProfile | null> {
  const baseUrl = gatewayUrl.replace(/\/+$/, "");
  const response = await fetchImpl(`${baseUrl}/api/v1/admin/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (response.status === 403) {
    throw new AdminApiError(403, "Acesso negado (403): papel PLATFORM_ADMIN é obrigatório.");
  }

  if (!response.ok) {
    throw new AdminApiError(response.status, `Falha ao consultar perfil administrativo (${response.status})`);
  }

  return (await response.json()) as AdminProfile;
}
