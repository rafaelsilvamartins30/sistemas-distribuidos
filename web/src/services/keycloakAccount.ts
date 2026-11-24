import type Keycloak from "keycloak-js";
import { parseApiError } from "../utils/apiError.js";

export interface KeycloakSession {
  id: string;
  ipAddress: string;
  started: number;
  lastAccess: number;
  current?: boolean;
  clients?: Record<string, string | KeycloakSessionClient> | Array<string | KeycloakSessionClient>;
}

interface KeycloakSessionClient {
  clientId?: string;
  clientName?: string;
}

interface KeycloakCredentialMetadata {
  credential?: { id: string; type: string };
}

interface KeycloakCredential {
  type: string;
  userCredentialMetadatas?: KeycloakCredentialMetadata[];
}

export class KeycloakAccountError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `Keycloak respondeu com status ${status}.`);
    this.name = "KeycloakAccountError";
  }
}

async function accountRequest<T>(keycloak: Keycloak, path: string, method = "GET"): Promise<T> {
  await keycloak.updateToken(30);
  if (!keycloak.token) throw new Error("Token de acesso indisponível.");

  const accountUrl = `/keycloak-account/realms/${import.meta.env.VITE_KEYCLOAK_REALM}/account`;
  const response = await fetch(`${accountUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${keycloak.token}`,
    },
  });
  if (!response.ok) {
    const parsed = await parseApiError(response, `Keycloak respondeu com status ${response.status}.`);
    throw new KeycloakAccountError(response.status, parsed.message);
  }
  if (response.status === 204) return undefined as T;
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Resposta não JSON de ${path}.`);
  }
  return response.json() as Promise<T>;
}

export function getMySessions(keycloak: Keycloak): Promise<KeycloakSession[]> {
  return accountRequest<KeycloakSession[]>(keycloak, "/sessions").then((sessions) => {
    if (!Array.isArray(sessions)) throw new Error("A lista de sessões retornada pelo Keycloak não é válida.");
    return sessions;
  });
}

export function endMySession(keycloak: Keycloak, sessionId: string): Promise<void> {
  return accountRequest<void>(keycloak, `/sessions/${encodeURIComponent(sessionId)}`, "DELETE");
}

export async function hasTotpCredential(keycloak: Keycloak): Promise<boolean> {
  const credentials = await accountRequest<KeycloakCredential[]>(keycloak, "/credentials?user-credentials=true");
  if (!Array.isArray(credentials)) throw new Error("A lista de credenciais retornada pelo Keycloak não é válida.");
  return credentials.some(
    (credential) => credential.type === "otp" && (credential.userCredentialMetadatas?.length ?? 0) > 0,
  );
}

export function formatSessionDate(value: number): string {
  const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

export function sessionClientNames(clients?: KeycloakSession["clients"]): string[] {
  if (!clients) return [];
  const entries = Array.isArray(clients) ? clients : Object.values(clients);
  return entries.map((client) => {
    if (typeof client === "string") return client;
    if (client.clientId === "unir-web") return "UNIR";
    if (client.clientId === "account-console") return "Conta UNIR";
    if (client.clientName && !/^\$\{.*\}$/.test(client.clientName)) return client.clientName;
    return client.clientId || "Aplicativo";
  });
}
