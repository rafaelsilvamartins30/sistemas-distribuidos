import { AdminFeedback } from "./components/AdminFeedback";
import { AdminModal } from "./components/AdminModal";
import { useEffect, useState, type FormEvent } from "react";
import Keycloak from "keycloak-js";
import { env } from "./config/env";
import { useToast } from "./contexts/ToastContext";
import { extractErrorMessage } from "./utils/apiError";
import { fetchAdminProfile, hasPlatformAdminRole, type AdminProfile, type TokenPayload } from "./services/adminSession";
import {
  deleteCampusStructure,
  getCampusOverview,
  reviewInstitutionalRequest,
  updateProfileAdministrators,
  updateUniversityProfile,
  type CampusOverview,
  type CampusUserSummary,
  type DeletableStructureKind,
  type InstitutionalRequestSummary,
  type PermissionTargetKind,
} from "./services/campusOverview";
import { SportsManagementPanel } from "./components/SportsManagementPanel";
import { CampusStructureManager } from "./components/CampusStructureManager";

interface SessionState {
  status: "loading" | "unauthenticated" | "authenticated" | "error";
  tokenParsed?: TokenPayload;
  profile: AdminProfile | null;
  errorMessage?: string;
}

interface AppProps {
  keycloak: Keycloak;
  keycloakReady: Promise<boolean>;
}

const NO_ADMIN_PERMISSION_MESSAGE = "Você não tem permissão para acessar este painel.";

export function App({ keycloak, keycloakReady }: AppProps) {
  const toast = useToast();
  const [session, setSession] = useState<SessionState>({
    status: "loading",
    profile: null,
  });
  const [overview, setOverview] = useState<CampusOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Permissions management state
  const [permTargetKey, setPermTargetKey] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [manualUserId, setManualUserId] = useState("");

  // University profile dialog state
  const [editingUniversity, setEditingUniversity] = useState(false);
  const [uniName, setUniName] = useState("");
  const [uniAcronym, setUniAcronym] = useState("");
  const [uniDescription, setUniDescription] = useState("");
  const [uniTerm, setUniTerm] = useState("");
  const [uniGeneralInfo, setUniGeneralInfo] = useState("");
  const [uniLinks, setUniLinks] = useState("");

  useEffect(() => {
    let active = true;
    keycloakReady
      .then(async (authenticated) => {
        if (!active) return;
        const token = keycloak.token;
        if (!authenticated || !token) {
          setSession({ status: "unauthenticated", profile: null });
          return;
        }

        const tokenParsed = keycloak.tokenParsed as TokenPayload | undefined;
        try {
          const profile = await fetchAdminProfile(env.gatewayUrl, token);
          if (!active) return;
          setSession({
            status: "authenticated",
            tokenParsed,
            profile,
            ...(!profile || !hasPlatformAdminRole(tokenParsed) ? { errorMessage: NO_ADMIN_PERMISSION_MESSAGE } : {}),
          });
          if (!profile || !hasPlatformAdminRole(tokenParsed)) return;

          setOverviewLoading(true);
          try {
            const campusData = await getCampusOverview(env.gatewayUrl, token);
            if (active) setOverview(campusData);
          } catch (error) {
            if (active) toast.error(extractErrorMessage(error, "Falha ao consultar o Campus."));
          } finally {
            if (active) setOverviewLoading(false);
          }
        } catch (error) {
          if (!active) return;
          const message = extractErrorMessage(error, "Não foi possível verificar sua permissão.");
          toast.error(message);
          setSession({
            status: "authenticated",
            tokenParsed,
            profile: null,
            errorMessage: message,
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = extractErrorMessage(error, "Não foi possível conectar ao Keycloak.");
        toast.error(message);
        setSession({
          status: "error",
          profile: null,
          errorMessage: message,
        });
      });

    return () => {
      active = false;
    };
  }, [keycloak, keycloakReady, toast]);

  const redirectUri = window.location.origin + window.location.pathname + window.location.search;
  const isPlatformAdmin = hasPlatformAdminRole(session.tokenParsed);
  const isAuthorized = session.status === "authenticated" && Boolean(session.profile) && isPlatformAdmin;

  async function reloadOverview(token: string) {
    setOverview(await getCampusOverview(env.gatewayUrl, token));
  }

  async function reviewRequest(requestId: string, decision: "approve" | "reject") {
    const token = keycloak.token;
    if (!token) return;
    setReviewingRequestId(requestId);
    try {
      await reviewInstitutionalRequest(env.gatewayUrl, token, requestId, decision);
      await reloadOverview(token);
      toast.success(decision === "approve" ? "Solicitação aprovada com sucesso." : "Solicitação recusada.");
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível revisar a solicitação."));
    } finally {
      setReviewingRequestId("");
    }
  }

  const permissionTargets = overview
    ? [
        ...overview.academicUnits.items.map((u) => ({
          key: `academic-units:${u.id}`,
          kind: "academic-units" as PermissionTargetKind,
          id: u.id,
          label: `Unidade — ${u.code} (${u.name})`,
          adminIds: u.administratorUserIds ?? [],
        })),
        ...overview.departments.items.map((d) => ({
          key: `departments:${d.id}`,
          kind: "departments" as PermissionTargetKind,
          id: d.id,
          label: `Departamento — ${d.acronym} (${d.name})`,
          adminIds: d.administratorUserIds ?? [],
        })),
        ...overview.entities.items.map((e) => ({
          key: `entities:${e.id}`,
          kind: "entities" as PermissionTargetKind,
          id: e.id,
          label: `Entidade — ${e.name}`,
          adminIds: e.administratorUserIds ?? [],
        })),
        ...overview.communities.items.map((c) => ({
          key: `communities:${c.id}`,
          kind: "communities" as PermissionTargetKind,
          id: c.id,
          label: `Comunidade — ${c.name}`,
          adminIds: c.administratorUserIds ?? [],
        })),
      ]
    : [];

  const activeTarget = permissionTargets.find((t) => t.key === permTargetKey) ?? permissionTargets[0];
  const usersList: CampusUserSummary[] = overview?.users?.items ?? [];
  const semesterOptions = overview?.semesters?.items ?? [];
  const globalAdminUserId = overview?.university?.protectedAdministratorUserId ?? "";

  function resolveUserLabel(keycloakSub: string): string {
    const found = usersList.find((u) => u.keycloakUserId === keycloakSub);
    return found ? `${found.name} (${found.registrationCode ?? found.userType ?? "Campus"})` : keycloakSub;
  }

  function isProtectedGlobalAdmin(keycloakSub: string): boolean {
    return Boolean(globalAdminUserId) && keycloakSub === globalAdminUserId;
  }

  async function handleAddAdmin() {
    const token = keycloak.token;
    const candidate = (selectedUserId || manualUserId).trim();
    if (!token || !activeTarget || !candidate) return;
    const nextIds = Array.from(new Set([...activeTarget.adminIds, candidate]));
    setActionBusy(true);
    try {
      await updateProfileAdministrators(env.gatewayUrl, token, activeTarget.kind, activeTarget.id, nextIds);
      setSelectedUserId("");
      setManualUserId("");
      toast.success(`Permissão concedida em "${activeTarget.label}".`);
      await reloadOverview(token);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível atualizar as permissões."));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRemoveAdmin(userIdToRemove: string) {
    const token = keycloak.token;
    if (!token || !activeTarget) return;
    if (isProtectedGlobalAdmin(userIdToRemove)) {
      toast.info("O administrador global não pode ser removido.");
      return;
    }
    const nextIds = activeTarget.adminIds.filter((id) => id !== userIdToRemove);
    setActionBusy(true);
    try {
      await updateProfileAdministrators(env.gatewayUrl, token, activeTarget.kind, activeTarget.id, nextIds);
      toast.success(`Permissão removida de "${activeTarget.label}".`);
      await reloadOverview(token);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível remover a permissão."));
    } finally {
      setActionBusy(false);
    }
  }

  function startEditUniversity() {
    if (!overview) return;
    setUniName(overview.university.name);
    setUniAcronym(overview.university.acronym);
    setUniDescription(overview.university.description ?? "");
    setUniTerm(overview.university.currentTerm ?? "");
    setUniGeneralInfo(overview.university.generalInfoMarkdown ?? "");
    setUniLinks(
      (overview.university.links ?? [])
        .map((link) => {
          if (typeof link === "string") return link;
          if (link && typeof link === "object" && "url" in link) {
            const item = link as { label?: unknown; url: string };
            return `${typeof item.label === "string" && item.label.trim() ? item.label.trim() : item.url} | ${item.url}`;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n"),
    );
    setEditingUniversity(true);
  }

  async function handleSaveUniversity(event: FormEvent) {
    event.preventDefault();
    const token = keycloak.token;
    if (!token) return;
    setActionBusy(true);
    try {
      await updateUniversityProfile(env.gatewayUrl, token, {
        name: uniName.trim(),
        acronym: uniAcronym.trim().toUpperCase(),
        description: uniDescription.trim(),
        currentTerm: uniTerm.trim(),
        generalInfoMarkdown: uniGeneralInfo.trim(),
        links: uniLinks
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const separator = line.indexOf("|");
            if (separator < 0) return line;
            return { label: line.slice(0, separator).trim(), url: line.slice(separator + 1).trim() };
          }),
      });
      setEditingUniversity(false);
      toast.success("Perfil da universidade atualizado com sucesso!");
      await reloadOverview(token);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível atualizar o perfil da universidade."));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDeleteTarget() {
    const token = keycloak.token;
    if (!token || !activeTarget || !activeTarget.id) return;
    if (!window.confirm(`Tem certeza que deseja apagar "${activeTarget.label}"?`)) return;
    setActionBusy(true);
    try {
      await deleteCampusStructure(env.gatewayUrl, token, activeTarget.kind as DeletableStructureKind, activeTarget.id);
      setPermTargetKey("");
      toast.success(`Estrutura "${activeTarget.label}" apagada com sucesso.`);
      await reloadOverview(token);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível apagar a estrutura (verifique se há vínculos ativos)."));
    } finally {
      setActionBusy(false);
    }
  }

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
          <span className="admin-role-pill">{isPlatformAdmin ? "Acesso institucional" : "Sem permissão"}</span>
        </div>
        <div className="admin-actions">
          {session.status === "authenticated" ? (
            <button type="button" className="btn-secondary" onClick={() => void keycloak.logout({ redirectUri })}>
              Encerrar sessão
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => void keycloak.login({ redirectUri })}>
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
            <p>
              Crie estruturas acadêmicas, gerencie listas de administradores (permissões contextuais) e aprove
              solicitações da comunidade universitária.
            </p>
          </div>
          <div className={`admin-hero-status ${isAuthorized ? "is-authorized" : ""}`}>
            <span className="admin-status-dot" />
            {isAuthorized ? "Acesso validado" : session.status === "loading" ? "Verificando acesso" : "Sem permissão"}
          </div>
        </section>

        {session.status === "loading" && (
          <AdminFeedback tone="info">Verificando sua sessão no Keycloak e no Gateway…</AdminFeedback>
        )}
        {session.status === "unauthenticated" && (
          <div className="admin-card admin-state-panel">
            <strong>Você não tem permissão para acessar este painel</strong>
            <p>Faça login com uma conta autorizada para continuar.</p>
          </div>
        )}
        {session.status === "error" && <AdminFeedback>{session.errorMessage}</AdminFeedback>}
        {session.status === "authenticated" && session.errorMessage && (
          <AdminFeedback>{session.errorMessage}</AdminFeedback>
        )}

        {isAuthorized && (
          <>
            {overviewLoading && (
              <AdminFeedback tone="info">Carregando os dados institucionais do Campus…</AdminFeedback>
            )}
            {!!overview?.unavailableSections?.length && (
              <p role="status">
                Parte do catálogo está temporariamente indisponível. Atualize o painel para tentar novamente.
              </p>
            )}
            {overview && (
              <>
                <div className="admin-stats-grid" aria-label="Resumo institucional">
                  <StatCard
                    label="Unidades acadêmicas"
                    value={overview.academicUnits.totalElements}
                    detail="Estruturas de ensino e pesquisa"
                  />
                  <StatCard
                    label="Departamentos"
                    value={overview.departments.totalElements}
                    detail="Departamentos cadastrados"
                  />
                  <StatCard
                    label="Entidades acadêmicas"
                    value={overview.entities.totalElements}
                    detail="Espaços vinculados ao Campus"
                  />
                  <StatCard
                    label="Solicitações"
                    value={overview.pendingRequests.totalElements}
                    detail="Pendentes de decisão"
                  />
                </div>

                <section className="admin-card admin-university-card" aria-labelledby="university-info-title">
                  <div className="admin-card-heading">
                    <span className="admin-card-icon" aria-hidden="true">
                      U
                    </span>
                    <div>
                      <span className="admin-eyebrow">Perfil institucional</span>
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
                      <strong>Cursos cadastrados</strong>
                      {overview.courses?.totalElements ?? 0}
                    </span>
                  </div>
                  <div className="admin-form-actions">
                    <button type="button" className="btn-secondary" onClick={startEditUniversity}>
                      Editar universidade
                    </button>
                  </div>
                </section>

                {editingUniversity && (
                  <AdminModal
                    eyebrow="Perfil institucional"
                    title="Editar universidade"
                    closeDisabled={actionBusy}
                    onClose={() => setEditingUniversity(false)}
                  >
                    <form
                      className="admin-form admin-dialog-form"
                      onSubmit={(event) => void handleSaveUniversity(event)}
                    >
                      <div className="admin-form-row">
                        <label>
                          <span>Nome</span>
                          <input required value={uniName} onChange={(event) => setUniName(event.target.value)} />
                        </label>
                        <label>
                          <span>Sigla</span>
                          <input required value={uniAcronym} onChange={(event) => setUniAcronym(event.target.value)} />
                        </label>
                        <label>
                          <span>Semestre atual</span>
                          <select required value={uniTerm} onChange={(event) => setUniTerm(event.target.value)}>
                            <option value="" disabled>
                              Selecione um semestre…
                            </option>
                            {uniTerm && !semesterOptions.some((semester) => semester.name === uniTerm) && (
                              <option value={uniTerm}>{uniTerm}</option>
                            )}
                            {semesterOptions.map((semester) => (
                              <option key={semester.id} value={semester.name}>
                                {semester.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label>
                        <span>Descrição</span>
                        <textarea
                          rows={2}
                          value={uniDescription}
                          onChange={(event) => setUniDescription(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Informações em Markdown</span>
                        <textarea
                          rows={5}
                          value={uniGeneralInfo}
                          onChange={(event) => setUniGeneralInfo(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>Links e contatos</span>
                        <textarea rows={3} value={uniLinks} onChange={(event) => setUniLinks(event.target.value)} />
                        <small>Um por linha. Use a URL ou “Rótulo | URL”.</small>
                      </label>
                      <div className="admin-dialog-actions">
                        <button type="button" className="btn-secondary" onClick={() => setEditingUniversity(false)}>
                          Cancelar
                        </button>
                        <button type="submit" className="btn-primary" disabled={actionBusy}>
                          {actionBusy ? "Salvando…" : "Salvar perfil"}
                        </button>
                      </div>
                    </form>
                  </AdminModal>
                )}

                <SportsManagementPanel gatewayUrl={env.gatewayUrl} keycloak={keycloak} />
                {keycloak.token && (
                  <CampusStructureManager
                    gatewayUrl={env.gatewayUrl}
                    token={keycloak.token}
                    overview={overview}
                    onSaved={() => reloadOverview(keycloak.token ?? "")}
                  />
                )}

                <section className="admin-card admin-manage-card" aria-labelledby="permissions-title">
                  <div className="admin-directory-heading">
                    <div>
                      <span className="admin-eyebrow">Permissões contextuais</span>
                      <h2 id="permissions-title">Administradores de entidades e órgãos</h2>
                    </div>
                    <span className="admin-count-pill">{activeTarget?.adminIds.length ?? 0}</span>
                  </div>
                  <p className="admin-empty-note">
                    Administradores podem editar o perfil e publicar comunicados, além de gerenciar eventos e
                    oportunidades do órgão selecionado.
                  </p>

                  <div className="admin-form">
                    <label>
                      <span>Selecionar órgão / entidade / comunidade</span>
                      <select
                        value={activeTarget?.key ?? ""}
                        disabled={!permissionTargets.length}
                        onChange={(e) => setPermTargetKey(e.target.value)}
                      >
                        {permissionTargets.map((target) => (
                          <option key={target.key} value={target.key}>
                            {target.label} ({target.adminIds.length} admin)
                          </option>
                        ))}
                      </select>
                    </label>

                    {activeTarget && (
                      <ul className="admin-perm-list">
                        {activeTarget.adminIds.length > 0 ? (
                          activeTarget.adminIds.map((adminSub) => (
                            <li key={adminSub}>
                              <span>{resolveUserLabel(adminSub)}</span>
                              {isProtectedGlobalAdmin(adminSub) ? (
                                <span className="admin-protected-admin">Administrador global · acesso permanente</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled={actionBusy}
                                  onClick={() => void handleRemoveAdmin(adminSub)}
                                >
                                  Remover
                                </button>
                              )}
                            </li>
                          ))
                        ) : (
                          <li>
                            <span>Nenhum administrador atribuído ainda.</span>
                          </li>
                        )}
                      </ul>
                    )}

                    <div className="admin-form-row">
                      <label>
                        <span>Escolher usuário cadastrado</span>
                        <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                          <option value="">Selecione um usuário…</option>
                          {usersList.map((user) => (
                            <option key={user.id} value={user.keycloakUserId}>
                              {user.name} ({user.registrationCode ?? user.userType ?? "Campus"})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Ou informar sub/UUID do Keycloak</span>
                        <input
                          type="text"
                          value={manualUserId}
                          onChange={(e) => setManualUserId(e.target.value)}
                          placeholder="UUID do usuário no Keycloak"
                        />
                      </label>
                    </div>
                    <div className="admin-form-actions">
                      {activeTarget && (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={actionBusy}
                          onClick={() => void handleDeleteTarget()}
                        >
                          Apagar estrutura selecionada
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={actionBusy || (!selectedUserId && !manualUserId.trim())}
                        onClick={() => void handleAddAdmin()}
                      >
                        {actionBusy ? "Salvando…" : "+ Conceder permissão"}
                      </button>
                    </div>
                  </div>
                </section>

                <RequestsCard
                  requests={overview.pendingRequests.items}
                  reviewingRequestId={reviewingRequestId}
                  onReview={reviewRequest}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function RequestsCard({
  requests,
  reviewingRequestId,
  onReview,
}: {
  requests: InstitutionalRequestSummary[];
  reviewingRequestId: string;
  onReview: (requestId: string, decision: "approve" | "reject") => Promise<void>;
}) {
  return (
    <section className="admin-card admin-requests-card" aria-labelledby="pending-requests-title">
      <div className="admin-directory-heading">
        <div>
          <span className="admin-eyebrow">Fluxos administrativos</span>
          <h2 id="pending-requests-title">Solicitações pendentes</h2>
        </div>
        <span className="admin-count-pill">{requests.length}</span>
      </div>
      {requests.length ? (
        <ul>
          {requests.map((request) => {
            const busy = reviewingRequestId === request.id;
            return (
              <li key={request.id}>
                <div className="admin-request-copy">
                  <span>{request.type.replaceAll("_", " ")}</span>
                  <strong>{request.title}</strong>
                  <small>
                    {request.requesterName || "Usuário do campus"} · {request.targetDepartmentName || "Universidade"}
                  </small>
                </div>
                <div className="admin-request-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy || Boolean(reviewingRequestId)}
                    onClick={() => void onReview(request.id, "reject")}
                  >
                    Recusar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || Boolean(reviewingRequestId)}
                    onClick={() => void onReview(request.id, "approve")}
                  >
                    {busy ? "Processando…" : "Aprovar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="admin-empty-note">Nenhuma solicitação aguardando decisão.</p>
      )}
    </section>
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
