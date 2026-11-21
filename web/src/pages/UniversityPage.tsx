import { useEffect, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { FollowControl, InstitutionalPostsPanel } from "../components/CampusSocial";
import { InstitutionalProfileEditor } from "../components/InstitutionalProfileEditor";
import {
  InstitutionalLinks,
  InstitutionalProfileTabs,
  MarkdownContent,
  useInstitutionalProfileTab,
} from "../components/InstitutionalProfileContent";
import {
  createSemester,
  createUniversityProfile,
  getSemesters,
  getUniversity,
  updateSemester,
  type Semester,
  type University,
} from "../services/campus";

interface WebContext {
  keycloak: Keycloak;
}

export function UniversityPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [university, setUniversity] = useState<University | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileKind, setProfileKind] = useState<"ACADEMIC_UNIT" | "DEPARTMENT">("DEPARTMENT");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [saving, setSaving] = useState(false);
  const [creationMessage, setCreationMessage] = useState("");
  const [selectedTab, setSelectedTab] = useInstitutionalProfileTab();
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [semesterDraft, setSemesterDraft] = useState({ name: "", startOn: "", endOn: "" });
  const [editingSemesterId, setEditingSemesterId] = useState<string | null>(null);
  const [semesterError, setSemesterError] = useState("");
  const [semesterMessage, setSemesterMessage] = useState("");
  const [savingSemester, setSavingSemester] = useState(false);

  useEffect(() => {
    let active = true;
    getUniversity(keycloak.token ?? "")
      .then((result) => {
        if (!active) return;
        setUniversity(result);
        document.title = `UNIR — ${result.name}`;
      })
      .catch(() => active && setError("Não foi possível carregar o perfil da universidade."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [keycloak]);

  useEffect(() => {
    if (!university?.viewerCanManage) return;
    let active = true;
    getSemesters(keycloak.token ?? "")
      .then(({ items }) => active && setSemesters(items))
      .catch(() => active && setSemesterError("Não foi possível carregar os semestres cadastrados."));
    return () => {
      active = false;
    };
  }, [keycloak.token, university?.viewerCanManage]);

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!university?.viewerCanManage) return;
    setSaving(true);
    setError("");
    setCreationMessage("");
    try {
      const created = await createUniversityProfile(keycloak.token ?? "", profileKind, {
        ...(profileKind === "DEPARTMENT" ? { acronym: code } : { code }),
        name,
        description,
        generalInfoMarkdown: markdown,
        links: [],
      });
      const response = created as { name?: string };
      setCreationMessage(
        `${profileKind === "DEPARTMENT" ? "Departamento" : "Unidade acadêmica"} ${response.name ?? name} cadastrado e você foi incluído como administrador.`,
      );
      setCode("");
      setName("");
      setDescription("");
      setMarkdown("");
    } catch {
      setError("Somente administradores da universidade podem criar perfis. Revise se a sigla já está cadastrada.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSemester(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!university?.viewerCanManage) return;
    setSavingSemester(true);
    setSemesterError("");
    setSemesterMessage("");
    try {
      const saved = editingSemesterId
        ? await updateSemester(keycloak.token ?? "", editingSemesterId, semesterDraft)
        : await createSemester(keycloak.token ?? "", semesterDraft);
      setSemesters((current) =>
        [...current.filter((semester) => semester.id !== saved.id), saved].sort((a, b) =>
          b.startOn.localeCompare(a.startOn),
        ),
      );
      setSemesterDraft({ name: "", startOn: "", endOn: "" });
      setEditingSemesterId(null);
      setSemesterMessage(`${saved.name} salvo.`);
    } catch {
      setSemesterError("Não foi possível salvar. Use o formato AAAA/1 ou AAAA/2 e confira as datas.");
    } finally {
      setSavingSemester(false);
    }
  }

  return (
    <div className="detail-page campus-institution-profile">
      <Link className="back-link" to="/">
        ← Voltar ao início
      </Link>
      {loading ? (
        <p className="notice" role="status">
          Carregando universidade…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : university ? (
        <>
          {university.bannerUrl && <img className="campus-space-detail-banner" src={university.bannerUrl} alt="" />}
          <article className="detail-main-card">
            <div className="campus-institution-heading">
              {university.logoUrl && (
                <img className="campus-space-detail-logo" src={university.logoUrl} alt={`Logo de ${university.name}`} />
              )}
              <div>
                <p className="eyebrow">{university.acronym} · Universidade</p>
                <h1>{university.name}</h1>
                <p className="detail-lead">{university.description}</p>
              </div>
              <FollowControl token={keycloak.token ?? ""} type="UNIVERSITY" profileId={university.id} />
            </div>
          </article>
          <InstitutionalProfileTabs selected={selectedTab} onSelect={setSelectedTab} />
          <section
            id="profile-panel-profile"
            role="tabpanel"
            aria-labelledby="profile-tab-profile"
            hidden={selectedTab !== "profile"}
          >
            {selectedTab === "profile" && (
              <>
                <article className="detail-main-card">
                  <section className="detail-copy-section">
                    <h2>Informações gerais</h2>
                    <MarkdownContent value={university.generalInfoMarkdown} />
                  </section>
                  <p className="department-university-meta">Semestre atual: {university.currentTerm}</p>
                  <InstitutionalLinks links={university.links} />
                  <InstitutionalProfileEditor
                    token={keycloak.token ?? ""}
                    type="UNIVERSITY"
                    profileId={university.id}
                    profile={university}
                    onSaved={(updated) =>
                      setUniversity((current) => current && ({ ...current, ...updated } as University))
                    }
                  />
                </article>
                {university.viewerCanManage && (
                  <section className="campus-social-panel" aria-labelledby="university-create-profile-title">
                    <header className="campus-social-heading">
                      <div>
                        <p className="eyebrow">Administração universitária</p>
                        <h2 id="university-create-profile-title">Criar departamento ou unidade</h2>
                        <p>Você será adicionado automaticamente como administrador do novo perfil.</p>
                      </div>
                    </header>
                    <form className="campus-post-composer" onSubmit={(event) => void createProfile(event)}>
                      <label className="field">
                        <span>Tipo</span>
                        <select
                          value={profileKind}
                          onChange={(event) => setProfileKind(event.target.value as "ACADEMIC_UNIT" | "DEPARTMENT")}
                        >
                          <option value="DEPARTMENT">Departamento</option>
                          <option value="ACADEMIC_UNIT">Unidade acadêmica</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{profileKind === "DEPARTMENT" ? "Sigla" : "Código"}</span>
                        <input required maxLength={80} value={code} onChange={(event) => setCode(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Nome</span>
                        <input
                          required
                          maxLength={255}
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Descrição</span>
                        <textarea
                          required
                          rows={2}
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Informações em Markdown</span>
                        <textarea
                          required
                          rows={4}
                          value={markdown}
                          onChange={(event) => setMarkdown(event.target.value)}
                        />
                      </label>
                      {creationMessage && (
                        <p className="notice notice-success" role="status">
                          {creationMessage}
                        </p>
                      )}
                      {error && (
                        <p className="notice notice-error" role="alert">
                          {error}
                        </p>
                      )}
                      <button className="button button-primary" disabled={saving} type="submit">
                        {saving ? "Salvando…" : "Criar perfil"}
                      </button>
                    </form>
                  </section>
                )}
                {university.viewerCanManage && (
                  <section className="campus-social-panel campus-semester-admin" aria-labelledby="semester-admin-title">
                    <header className="campus-social-heading">
                      <div>
                        <p className="eyebrow">Administração universitária</p>
                        <h2 id="semester-admin-title">Semestres</h2>
                        <p>Cadastre o período acadêmico para organizar e filtrar as publicações.</p>
                      </div>
                    </header>
                    <form className="campus-semester-form" onSubmit={(event) => void saveSemester(event)}>
                      <label className="field">
                        <span>Semestre</span>
                        <input
                          required
                          pattern="[0-9]{4}/[12]"
                          placeholder="2026/2"
                          value={semesterDraft.name}
                          onChange={(event) =>
                            setSemesterDraft((current) => ({ ...current, name: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Data de início</span>
                        <input
                          required
                          type="date"
                          value={semesterDraft.startOn}
                          onChange={(event) =>
                            setSemesterDraft((current) => ({ ...current, startOn: event.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Data de fim</span>
                        <input
                          required
                          type="date"
                          value={semesterDraft.endOn}
                          onChange={(event) =>
                            setSemesterDraft((current) => ({ ...current, endOn: event.target.value }))
                          }
                        />
                      </label>
                      <div className="campus-semester-form-actions">
                        <button className="button button-primary" disabled={savingSemester} type="submit">
                          {savingSemester
                            ? "Salvando…"
                            : editingSemesterId
                              ? "Salvar alterações"
                              : "Adicionar semestre"}
                        </button>
                        {editingSemesterId && (
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => {
                              setEditingSemesterId(null);
                              setSemesterDraft({ name: "", startOn: "", endOn: "" });
                            }}
                          >
                            Cancelar edição
                          </button>
                        )}
                      </div>
                    </form>
                    {semesterError && (
                      <p className="notice notice-error" role="alert">
                        {semesterError}
                      </p>
                    )}
                    {semesterMessage && (
                      <p className="notice" role="status">
                        {semesterMessage}
                      </p>
                    )}
                    <div className="campus-semester-list">
                      {semesters.map((semester) => (
                        <div className="campus-semester-row" key={semester.id}>
                          <strong>{semester.name}</strong>
                          <span>
                            {semester.startOn} — {semester.endOn}
                          </span>
                          <button
                            className="text-link"
                            type="button"
                            onClick={() => {
                              setEditingSemesterId(semester.id);
                              setSemesterDraft({
                                name: semester.name,
                                startOn: semester.startOn,
                                endOn: semester.endOn,
                              });
                            }}
                          >
                            Editar
                          </button>
                        </div>
                      ))}
                      {semesters.length === 0 && !semesterError && <p>Nenhum semestre cadastrado.</p>}
                    </div>
                  </section>
                )}
              </>
            )}
          </section>
          <section
            id="profile-panel-posts"
            role="tabpanel"
            aria-labelledby="profile-tab-posts"
            hidden={selectedTab !== "posts"}
          >
            {selectedTab === "posts" && (
              <InstitutionalPostsPanel
                token={keycloak.token ?? ""}
                type="UNIVERSITY"
                profileId={university.id}
                currentTerm={university.currentTerm}
                canManage={Boolean(university.viewerCanManage)}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
