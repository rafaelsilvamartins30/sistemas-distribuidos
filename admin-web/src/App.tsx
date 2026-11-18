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
import { getCampusOverview, type CampusOverview } from "./services/campusOverview";

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
  const [overview, setOverview] = useState<CampusOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");

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
          const profile = await fetchAdminProfile(env.gatewayUrl, client.token);
          if (!active) return;
          setSession({
            status: "authenticated",
            tokenParsed,
            profile,
            ...(!profile || !hasPlatformAdminRole(tokenParsed)
              ? { errorMessage: "O Gateway não confirmou uma autorização administrativa para esta conta." }
              : {}),
          });
          if (!profile || !hasPlatformAdminRole(tokenParsed)) return;

          setOverviewLoading(true);
          try {
            const campusData = await getCampusOverview(env.gatewayUrl, client.token);
            if (active) setOverview(campusData);
          } catch (error) {
            if (active) setOverviewError(error instanceof Error ? error.message : "Falha ao consultar o Campus.");
          } finally {
            if (active) setOverviewLoading(false);
          }
        } catch (error) {
          if (!active) return;
          setSession({
            status: "authenticated",
            tokenParsed,
            profile: null,
            errorMessage: error instanceof Error ? error.message : "Indisponibilidade no Gateway",
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
  const isAuthorized = session.status === "authenticated" && Boolean(session.profile) && isPlatformAdmin;

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true">
            U
          </span>
          <span>
            <strong>UNIR</strong>
            <small>Administration</small>
          </span>
        </div>
        <div className="admin-header-context">
          {session.status === "authenticated" && (
            <span className="admin-user-name">{session.tokenParsed?.name ?? session.tokenParsed?.email}</span>
          )}
          <span className="admin-role-pill">{isPlatformAdmin ? "Acesso institucional" : "Acesso restrito"}</span>
        </div>
        <div className="admin-actions">
          {session.status === "authenticated" ? (
            <button type="button" className="btn-secondary" onClick={() => void keycloakClient?.logout()}>
              Encerrar sessão
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => void keycloakClient?.login()}>
              Entrar com Keycloak
            </button>
          )}
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-hero">
          <div>
            <span className="admin-eyebrow">Painel central da Reitoria</span>
            <h1>Administração Geral da Universidade</h1>
            <p>Visão institucional da UFRJ e das estruturas cadastradas no Campus.</p>
          </div>
          <div className={`admin-hero-status ${isAuthorized ? "is-authorized" : ""}`}>
            <span className="admin-status-dot" />
            {isAuthorized ? "Acesso validado" : session.status === "loading" ? "Verificando acesso" : "Acesso restrito"}
          </div>
        </section>

        {session.status === "loading" && (
          <p className="admin-notice" role="status">
            Verificando sua sessão no Keycloak e no Gateway…
          </p>
        )}
        {session.status === "unauthenticated" && (
          <div className="admin-card admin-state-panel">
            <strong>Entre com uma conta administrativa</strong>
            <p>O acesso a este painel exige autenticação e o papel global PLATFORM_ADMIN.</p>
          </div>
        )}
        {session.status === "error" && (
          <p className="admin-alert" role="alert">
            {session.errorMessage}
          </p>
        )}
        {session.status === "authenticated" && session.errorMessage && (
          <p className="admin-alert" role="alert">
            {session.errorMessage}
          </p>
        )}

        {isAuthorized && (
          <>
            {overviewLoading && (
              <p className="admin-notice" role="status">
                Carregando os dados institucionais do Campus…
              </p>
            )}
            {overviewError && (
              <p className="admin-alert" role="alert">
                {overviewError}
              </p>
            )}
            {overview && (
              <>
                <div className="admin-stats-grid" aria-label="Resumo institucional">
                  <StatCard
                    label="Departamentos"
                    value={overview.departments.totalElements}
                    detail="Unidades acadêmicas"
                  />
                  <StatCard
                    label="Entidades acadêmicas"
                    value={overview.entities.totalElements}
                    detail="Espaços vinculados ao Campus"
                  />
                  <StatCard
                    label="Comunidades"
                    value={overview.communities.totalElements}
                    detail="Grupos cadastrados"
                  />
                </div>

                <section className="admin-card admin-university-card" aria-labelledby="university-info-title">
                  <div className="admin-card-heading">
                    <span className="admin-card-icon" aria-hidden="true">
                      U
                    </span>
                    <div>
                      <span className="admin-eyebrow">Informações básicas</span>
                      <h2 id="university-info-title">{overview.university.name}</h2>
                    </div>
                    <span className="admin-acronym">{overview.university.acronym}</span>
                  </div>
                  <p>{overview.university.description || "Sem descrição institucional cadastrada."}</p>
                  <div className="admin-university-meta">
                    <span>
                      <strong>Semestre atual</strong>
                      {overview.university.currentTerm || "Não informado"}
                    </span>
                    <span>
                      <strong>Escopo de acesso</strong>Universidade
                    </span>
                    <span>
                      <strong>Papel ativo</strong>
                      {roles.join(", ") || "PLATFORM_ADMIN"}
                    </span>
                  </div>
                </section>

                <div className="admin-directory-grid">
                  <DirectoryCard
                    title="Departamentos acadêmicos"
                    count={overview.departments.totalElements}
                    items={overview.departments.items.map((item) => ({
                      id: item.id,
                      name: item.name,
                      label: item.acronym,
                      description: item.description,
                    }))}
                  />
                  <DirectoryCard
                    title="Comunidades e entidades"
                    count={overview.communities.totalElements + overview.entities.totalElements}
                    items={[
                      ...overview.communities.items.map((item) => ({
                        id: `community-${item.id}`,
                        name: item.name,
                        label: item.category || "Comunidade",
                        description: item.description,
                      })),
                      ...overview.entities.items.map((item) => ({
                        id: `entity-${item.id}`,
                        name: item.name,
                        label: item.entityType || "Entidade acadêmica",
                        description: item.description,
                      })),
                    ]}
                  />
                </div>

                <p className="admin-readonly-note">
                  Consulta somente leitura. Cadastro, homologação e gestão de permissões ainda não estão disponíveis
                  pelos contratos atuais.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <section className="admin-card admin-stat-card">
      <span className="admin-eyebrow">{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </section>
  );
}

function DirectoryCard({
  title,
  count,
  items,
}: {
  title: string;
  count: number;
  items: { id: string; name: string; label: string; description: string }[];
}) {
  return (
    <section className="admin-card admin-directory-card">
      <div className="admin-directory-heading">
        <div>
          <span className="admin-eyebrow">Campus</span>
          <h2>{title}</h2>
        </div>
        <span className="admin-count-pill">{count}</span>
      </div>
      {items.length ? (
        <ul>
          {items.slice(0, 6).map((item) => (
            <li key={item.id}>
              <span className="admin-directory-mark">{item.label.slice(0, 3).toLocaleUpperCase("pt-BR")}</span>
              <span className="admin-directory-copy">
                <strong>{item.name}</strong>
                <small>{item.description || item.label}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="admin-empty-note">Nenhum item cadastrado nesta página.</p>
      )}
    </section>
  );
}
