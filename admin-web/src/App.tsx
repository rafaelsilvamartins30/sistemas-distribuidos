import { useEffect, useState, type FormEvent } from "react";
import Keycloak from "keycloak-js";
import { env } from "./config/env";
import {
  extractRoles,
  fetchAdminProfile,
  hasPlatformAdminRole,
  type AdminProfile,
  type TokenPayload,
} from "./services/adminSession";
import {
  createAcademicUnit,
  createCourse,
  createDepartment,
  createSemester,
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

type CreateTab = "unit" | "department" | "course" | "semester";

export function App({ keycloak, keycloakReady }: AppProps) {
  const [session, setSession] = useState<SessionState>({
    status: "loading",
    profile: null,
  });
  const [overview, setOverview] = useState<CampusOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [reviewingRequestId, setReviewingRequestId] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  // Creation forms state
  const [createTab, setCreateTab] = useState<CreateTab>("unit");
  const [unitCode, setUnitCode] = useState("");
  const [unitName, setUnitName] = useState("");
  const [unitDescription, setUnitDescription] = useState("");
  const [deptAcronym, setDeptAcronym] = useState("");
  const [deptName, setDeptName] = useState("");
  const [deptDescription, setDeptDescription] = useState("");
  const [courseDeptId, setCourseDeptId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [semesterName, setSemesterName] = useState("");
  const [semesterStart, setSemesterStart] = useState("2026-08-01");
  const [semesterEnd, setSemesterEnd] = useState("2026-12-20");

  // Permissions management state
  const [permTargetKey, setPermTargetKey] = useState("university:root");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [manualUserId, setManualUserId] = useState("");

  // University profile inline editing
  const [editingUniversity, setEditingUniversity] = useState(false);
  const [uniName, setUniName] = useState("");
  const [uniAcronym, setUniAcronym] = useState("");
  const [uniDescription, setUniDescription] = useState("");
  const [uniTerm, setUniTerm] = useState("");

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
            ...(!profile || !hasPlatformAdminRole(tokenParsed)
              ? { errorMessage: "O Gateway não confirmou uma autorização administrativa para esta conta." }
              : {}),
          });
          if (!profile || !hasPlatformAdminRole(tokenParsed)) return;

          setOverviewLoading(true);
          try {
            const campusData = await getCampusOverview(env.gatewayUrl, token);
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
  }, [keycloak, keycloakReady]);

  const redirectUri = window.location.origin + window.location.pathname + window.location.search;
  const roles = extractRoles(session.tokenParsed);
  const isPlatformAdmin = hasPlatformAdminRole(session.tokenParsed);
  const isAuthorized = session.status === "authenticated" && Boolean(session.profile) && isPlatformAdmin;

  async function reloadOverview(token: string) {
    setOverview(await getCampusOverview(env.gatewayUrl, token));
  }

  async function reviewRequest(requestId: string, decision: "approve" | "reject") {
    const token = keycloak.token;
    if (!token) return;
    setReviewingRequestId(requestId);
    setReviewMessage("");
    setOverviewError("");
    try {
      await reviewInstitutionalRequest(env.gatewayUrl, token, requestId, decision);
      await reloadOverview(token);
      setReviewMessage(decision === "approve" ? "Solicitação aprovada com sucesso." : "Solicitação recusada.");
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Não foi possível revisar a solicitação.");
    } finally {
      setReviewingRequestId("");
    }
  }

  async function handleCreateStructure(event: FormEvent) {
    event.preventDefault();
    const token = keycloak.token;
    if (!token) return;
    setActionBusy(true);
    setActionMessage("");
    setOverviewError("");
    try {
      if (createTab === "unit") {
        await createAcademicUnit(env.gatewayUrl, token, {
          code: unitCode.trim().toUpperCase(),
          name: unitName.trim(),
          description: unitDescription.trim(),
          generalInfoMarkdown: unitDescription.trim() || `Unidade acadêmica ${unitName.trim()}.`,
        });
        setUnitCode("");
        setUnitName("");
        setUnitDescription("");
        setActionMessage("Unidade acadêmica criada com sucesso!");
      } else if (createTab === "department") {
        await createDepartment(env.gatewayUrl, token, {
          acronym: deptAcronym.trim().toUpperCase(),
          name: deptName.trim(),
          description: deptDescription.trim(),
          generalInfoMarkdown: deptDescription.trim() || `Departamento ${deptName.trim()}.`,
        });
        setDeptAcronym("");
        setDeptName("");
        setDeptDescription("");
        setActionMessage("Departamento criado com sucesso!");
      } else if (createTab === "course") {
        const deptId = courseDeptId || overview?.departments.items[0]?.id || "";
        await createCourse(env.gatewayUrl, token, { departmentId: deptId, name: courseName.trim() });
        setCourseName("");
        setActionMessage("Curso criado com sucesso!");
      } else {
        await createSemester(env.gatewayUrl, token, {
          name: semesterName.trim(),
          startOn: semesterStart,
          endOn: semesterEnd,
        });
        setSemesterName("");
        setActionMessage("Semestre letivo criado com sucesso!");
      }
      await reloadOverview(token);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Não foi possível salvar o registro.");
    } finally {
      setActionBusy(false);
    }
  }

  const permissionTargets = overview
    ? [
        {
          key: "university:root",
          kind: "university" as PermissionTargetKind,
          id: null as string | null,
          label: `Universidade — ${overview.university.name}`,
          adminIds: overview.university.administratorUserIds ?? [],
        },
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

  function resolveUserLabel(keycloakSub: string): string {
    const found = usersList.find((u) => u.keycloakUserId === keycloakSub);
    return found ? `${found.name} (${found.registrationCode ?? found.userType ?? "Campus"})` : keycloakSub;
  }

  async function handleAddAdmin() {
    const token = keycloak.token;
    const candidate = (selectedUserId || manualUserId).trim();
    if (!token || !activeTarget || !candidate) return;
    const nextIds = Array.from(new Set([...activeTarget.adminIds, candidate]));
    setActionBusy(true);
    setActionMessage("");
    setOverviewError("");
    try {
      await updateProfileAdministrators(env.gatewayUrl, token, activeTarget.kind, activeTarget.id, nextIds);
      setSelectedUserId("");
      setManualUserId("");
      setActionMessage(
        `Permissão concedida em "${activeTarget.label}". Os botões de gestão já estão ativos para esse usuário no Web.`,
      );
      await reloadOverview(token);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Não foi possível atualizar as permissões.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRemoveAdmin(userIdToRemove: string) {
    const token = keycloak.token;
    if (!token || !activeTarget) return;
    const nextIds = activeTarget.adminIds.filter((id) => id !== userIdToRemove);
    setActionBusy(true);
    setActionMessage("");
    setOverviewError("");
    try {
      await updateProfileAdministrators(env.gatewayUrl, token, activeTarget.kind, activeTarget.id, nextIds);
      setActionMessage(`Permissão removida de "${activeTarget.label}".`);
      await reloadOverview(token);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Não foi possível remover a permissão.");
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
    setEditingUniversity(true);
  }

  async function handleSaveUniversity(event: FormEvent) {
    event.preventDefault();
    const token = keycloak.token;
    if (!token) return;
    setActionBusy(true);
    setActionMessage("");
    setOverviewError("");
    try {
      await updateUniversityProfile(env.gatewayUrl, token, {
        name: uniName.trim(),
        acronym: uniAcronym.trim().toUpperCase(),
        description: uniDescription.trim(),
        currentTerm: uniTerm.trim(),
      });
      setEditingUniversity(false);
      setActionMessage("Perfil da universidade atualizado com sucesso!");
      await reloadOverview(token);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Não foi possível atualizar o perfil da universidade.");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDeleteTarget() {
    const token = keycloak.token;
    if (!token || !activeTarget || activeTarget.kind === "university" || !activeTarget.id) return;
    if (!window.confirm(`Tem certeza que deseja apagar "${activeTarget.label}"?`)) return;
    setActionBusy(true);
    setActionMessage("");
    setOverviewError("");
    try {
      await deleteCampusStructure(env.gatewayUrl, token, activeTarget.kind as DeletableStructureKind, activeTarget.id);
      setPermTargetKey("university:root");
      setActionMessage(`Estrutura "${activeTarget.label}" apagada com sucesso.`);
      await reloadOverview(token);
    } catch (error) {
      setOverviewError(
        error instanceof Error
          ? error.message
          : "Não foi possível apagar a estrutura (verifique se há vínculos ativos).",
      );
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
          <span className="admin-role-pill">{isPlatformAdmin ? "Acesso institucional" : "Acesso restrito"}</span>
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
            {actionMessage && (
              <p className="admin-success-message" role="status">
                {actionMessage}
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
                  {editingUniversity ? (
                    <form className="admin-form" onSubmit={(e) => void handleSaveUniversity(e)}>
                      <div className="admin-form-row">
                        <label>
                          <span>Nome da universidade</span>
                          <input type="text" required value={uniName} onChange={(e) => setUniName(e.target.value)} />
                        </label>
                        <label>
                          <span>Sigla</span>
                          <input
                            type="text"
                            required
                            value={uniAcronym}
                            onChange={(e) => setUniAcronym(e.target.value)}
                          />
                        </label>
                        <label>
                          <span>Semestre atual</span>
                          <input
                            type="text"
                            value={uniTerm}
                            onChange={(e) => setUniTerm(e.target.value)}
                            placeholder="2026/2"
                          />
                        </label>
                      </div>
                      <label>
                        <span>Descrição institucional</span>
                        <input type="text" value={uniDescription} onChange={(e) => setUniDescription(e.target.value)} />
                      </label>
                      <div className="admin-form-actions">
                        <button type="button" className="btn-secondary" onClick={() => setEditingUniversity(false)}>
                          Cancelar
                        </button>
                        <button type="submit" className="btn-primary" disabled={actionBusy}>
                          {actionBusy ? "Salvando…" : "Salvar perfil"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p>{overview.university.description || "Sem descrição institucional cadastrada."}</p>
                      <div className="admin-university-meta">
                        <span>
                          <strong>Semestre atual</strong>
                          {overview.university.currentTerm || "Não informado"}
                        </span>
                        <span>
                          <strong>Cursos ativos</strong>
                          {overview.courses?.totalElements ?? 0}
                        </span>
                        <span>
                          <strong>Papel ativo</strong>
                          {roles.includes("PLATFORM_ADMIN") ? "PLATFORM_ADMIN" : roles.join(", ")}
                        </span>
                      </div>
                      <div className="admin-form-actions">
                        <button type="button" className="btn-secondary" onClick={startEditUniversity}>
                          Editar perfil da universidade
                        </button>
                      </div>
                    </>
                  )}
                </section>

                <section className="admin-card admin-manage-card" aria-labelledby="create-structure-title">
                  <div className="admin-directory-heading">
                    <div>
                      <span className="admin-eyebrow">Gestão da estrutura</span>
                      <h2 id="create-structure-title">Criar estrutura acadêmica</h2>
                    </div>
                  </div>
                  <div className="admin-tabs">
                    <button
                      type="button"
                      className={createTab === "unit" ? "is-active" : ""}
                      onClick={() => setCreateTab("unit")}
                    >
                      Unidade Acadêmica
                    </button>
                    <button
                      type="button"
                      className={createTab === "department" ? "is-active" : ""}
                      onClick={() => setCreateTab("department")}
                    >
                      Departamento
                    </button>
                    <button
                      type="button"
                      className={createTab === "course" ? "is-active" : ""}
                      onClick={() => setCreateTab("course")}
                    >
                      Curso
                    </button>
                    <button
                      type="button"
                      className={createTab === "semester" ? "is-active" : ""}
                      onClick={() => setCreateTab("semester")}
                    >
                      Semestre
                    </button>
                  </div>

                  <form className="admin-form" onSubmit={(e) => void handleCreateStructure(e)}>
                    {createTab === "unit" && (
                      <>
                        <div className="admin-form-row">
                          <label>
                            <span>Sigla (ex: ICET)</span>
                            <input
                              type="text"
                              required
                              value={unitCode}
                              onChange={(e) => setUnitCode(e.target.value)}
                              placeholder="ICET"
                            />
                          </label>
                          <label>
                            <span>Nome da unidade</span>
                            <input
                              type="text"
                              required
                              value={unitName}
                              onChange={(e) => setUnitName(e.target.value)}
                              placeholder="Instituto de Ciências Exatas e Tecnológicas"
                            />
                          </label>
                        </div>
                        <label>
                          <span>Descrição</span>
                          <input
                            type="text"
                            value={unitDescription}
                            onChange={(e) => setUnitDescription(e.target.value)}
                            placeholder="Descrição institucional da unidade"
                          />
                        </label>
                      </>
                    )}

                    {createTab === "department" && (
                      <>
                        <div className="admin-form-row">
                          <label>
                            <span>Sigla (ex: DCC)</span>
                            <input
                              type="text"
                              required
                              value={deptAcronym}
                              onChange={(e) => setDeptAcronym(e.target.value)}
                              placeholder="DCC"
                            />
                          </label>
                          <label>
                            <span>Nome do departamento</span>
                            <input
                              type="text"
                              required
                              value={deptName}
                              onChange={(e) => setDeptName(e.target.value)}
                              placeholder="Departamento de Ciência da Computação"
                            />
                          </label>
                        </div>
                        <label>
                          <span>Descrição</span>
                          <input
                            type="text"
                            value={deptDescription}
                            onChange={(e) => setDeptDescription(e.target.value)}
                            placeholder="Descrição do departamento"
                          />
                        </label>
                      </>
                    )}

                    {createTab === "course" && (
                      <div className="admin-form-row">
                        <label>
                          <span>Departamento</span>
                          <select
                            required
                            value={courseDeptId || overview.departments.items[0]?.id || ""}
                            onChange={(e) => setCourseDeptId(e.target.value)}
                          >
                            {overview.departments.items.map((dept) => (
                              <option key={dept.id} value={dept.id}>
                                {dept.acronym} — {dept.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>Nome do curso</span>
                          <input
                            type="text"
                            required
                            value={courseName}
                            onChange={(e) => setCourseName(e.target.value)}
                            placeholder="Ciência da Computação"
                          />
                        </label>
                      </div>
                    )}

                    {createTab === "semester" && (
                      <div className="admin-form-row">
                        <label>
                          <span>Nome do semestre</span>
                          <input
                            type="text"
                            required
                            value={semesterName}
                            onChange={(e) => setSemesterName(e.target.value)}
                            placeholder="2026/2"
                          />
                        </label>
                        <label>
                          <span>Início</span>
                          <input
                            type="date"
                            required
                            value={semesterStart}
                            onChange={(e) => setSemesterStart(e.target.value)}
                          />
                        </label>
                        <label>
                          <span>Fim</span>
                          <input
                            type="date"
                            required
                            value={semesterEnd}
                            onChange={(e) => setSemesterEnd(e.target.value)}
                          />
                        </label>
                      </div>
                    )}

                    <div className="admin-form-actions">
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={actionBusy || (createTab === "course" && overview.departments.items.length === 0)}
                      >
                        {actionBusy ? "Salvando…" : "Cadastrar"}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="admin-card admin-manage-card" aria-labelledby="permissions-title">
                  <div className="admin-directory-heading">
                    <div>
                      <span className="admin-eyebrow">Permissões contextuais</span>
                      <h2 id="permissions-title">Administradores de entidades e órgãos</h2>
                    </div>
                    <span className="admin-count-pill">{activeTarget?.adminIds.length ?? 0}</span>
                  </div>
                  <p className="admin-empty-note">
                    Usuários listados aqui recebem automaticamente os botões de gestão no Web (+ Criar evento, + Criar
                    oportunidade, + Criar esporte e edição do perfil institucional).
                  </p>

                  <div className="admin-form">
                    <label>
                      <span>Selecionar órgão / entidade / comunidade</span>
                      <select value={permTargetKey} onChange={(e) => setPermTargetKey(e.target.value)}>
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
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={actionBusy}
                                onClick={() => void handleRemoveAdmin(adminSub)}
                              >
                                Remover
                              </button>
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
                      {activeTarget && activeTarget.kind !== "university" && (
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
                  message={reviewMessage}
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
  message,
  onReview,
}: {
  requests: InstitutionalRequestSummary[];
  reviewingRequestId: string;
  message: string;
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
      {message && <p className="admin-success-message">{message}</p>}
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
