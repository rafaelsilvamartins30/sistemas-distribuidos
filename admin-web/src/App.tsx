import { useEffect, useState } from "react";
import Keycloak from "keycloak-js";
import { env } from "./config/env";
import {
  extractRoles,
  fetchAdminProfile,
  hasPlatformAdminRole,
  type AdminProfile,
  type TokenPayload,
} from "./services/adminSession";

interface SessionState {
  status: "loading" | "unauthenticated" | "authenticated" | "error";
  tokenParsed?: TokenPayload;
  profile: AdminProfile | null;
  errorMessage?: string;
}

export function App() {
  const [keycloakClient, setKeycloakClient] = useState<Keycloak | null>(null);
  const [session, setSession] = useState<SessionState>({
    status: "loading",
    profile: null,
  });

  useEffect(() => {
    let active = true;
    const client = new Keycloak({
      url: env.keycloakUrl,
      realm: env.keycloakRealm,
      clientId: env.keycloakClientId,
    });
    setKeycloakClient(client);

    client
      .init({
        onLoad: "check-sso",
        pkceMethod: "S256",
        checkLoginIframe: false,
      })
      .then(async (authenticated) => {
        if (!active) return;
        if (!authenticated || !client.token) {
          setSession({ status: "unauthenticated", profile: null });
          return;
        }

        const tokenParsed = client.tokenParsed as TokenPayload | undefined;
        try {
          const profile = await fetchAdminProfile(env.adminBffUrl, client.token);
          if (!active) return;
          setSession({
            status: "authenticated",
            tokenParsed,
            profile,
          });
        } catch (error) {
          if (!active) return;
          setSession({
            status: "authenticated",
            tokenParsed,
            profile: null,
            errorMessage: error instanceof Error ? error.message : "Indisponibilidade no Admin BFF",
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setSession({
          status: "error",
          profile: null,
          errorMessage: error instanceof Error ? error.message : "Não foi possível conectar ao Keycloak",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  const roles = extractRoles(session.tokenParsed);
  const isPlatformAdmin = hasPlatformAdminRole(session.tokenParsed);

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <span className="admin-badge">UNIR Administration</span>
          <h1>Painel Administrativo Institucional</h1>
        </div>
        <div className="admin-actions">
          {session.status === "authenticated" ? (
            <button type="button" className="btn-secondary" onClick={() => keycloakClient?.logout()}>
              Encerrar sessão
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => keycloakClient?.login()}>
              Entrar com Keycloak
            </button>
          )}
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-card">
          <h2>Estado da Sessão</h2>
          {session.status === "loading" && <p>Verificando sessão junto ao provedor de identidade...</p>}
          {session.status === "unauthenticated" && (
            <p>Autentique-se com uma conta administrativa (`PLATFORM_ADMIN`) para acessar operações de governança.</p>
          )}
          {session.status === "error" && <p className="admin-alert">{session.errorMessage}</p>}
          {session.status === "authenticated" && (
            <dl className="admin-details">
              <div>
                <dt>Usuário autenticado</dt>
                <dd>{session.profile?.displayName ?? session.tokenParsed?.email ?? session.tokenParsed?.sub}</dd>
              </div>
              <div>
                <dt>Permissão administrativa</dt>
                <dd>{isPlatformAdmin ? "PLATFORM_ADMIN habilitado" : "Sem papel PLATFORM_ADMIN"}</dd>
              </div>
              <div>
                <dt>Papéis no token</dt>
                <dd>{roles.length > 0 ? roles.join(", ") : "Nenhum papel global atribuído"}</dd>
              </div>
            </dl>
          )}
          {session.errorMessage && session.status === "authenticated" && (
            <p className="admin-alert">{session.errorMessage}</p>
          )}
        </section>
      </main>
    </div>
  );
}
