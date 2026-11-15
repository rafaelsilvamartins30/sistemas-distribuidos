export interface AdminProfile {
  id: string;
  email: string;
  displayName: string;
  status: string;
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
  adminBffUrl: string,
  token: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<AdminProfile | null> {
  const baseUrl = adminBffUrl.replace(/\/+$/, "");
  const response = await fetchImpl(`${baseUrl}/api/v1/admin/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Falha ao consultar perfil administrativo (${response.status})`);
  }

  return (await response.json()) as AdminProfile;
}
