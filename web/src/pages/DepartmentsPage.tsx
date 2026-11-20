import { useEffect, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { DepartmentCard } from "../components/DepartmentCard";
import { PaginationControls } from "../components/PaginationControls";
import { FollowControl, InstitutionalPostsPanel } from "../components/CampusSocial";
import { InstitutionalProfileEditor } from "../components/InstitutionalProfileEditor";
import {
  InstitutionalLinks,
  InstitutionalProfileTabs,
  MarkdownContent,
  useInstitutionalProfileTab,
} from "../components/InstitutionalProfileContent";
import {
  CampusApiError,
  createDepartmentCourse,
  getDepartment,
  getDepartments,
  getUniversity,
  type Department,
  type University,
} from "../services/campus";

interface WebContext {
  keycloak: Keycloak;
}

function statusMessage(error: unknown): string {
  if (error instanceof CampusApiError && error.status === 404) return "Este registro não foi encontrado.";
  return "Não foi possível carregar os dados da universidade. Tente novamente.";
}

export function DepartmentsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [university, setUniversity] = useState<University | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [page, setPage] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "UNIR — Departamentos";
    let active = true;
    setLoading(true);
    setError(null);

    Promise.all([getUniversity(keycloak.token ?? ""), getDepartments(keycloak.token ?? "", page)])
      .then(([universityResult, departmentPage]) => {
        if (!active) return;
        setUniversity(universityResult);
        setDepartments(departmentPage.items);
        setTotalElements(departmentPage.totalElements);
        setTotalPages(departmentPage.totalPages);
        setLoading(false);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(statusMessage(requestError));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [keycloak, page]);

  return (
    <div className="catalog-page">
      <header className="page-intro product-page-intro">
        <p className="eyebrow">Estrutura universitária</p>
        {university ? (
          <>
            <h1>{university.name}</h1>
            <p>{university.description}</p>
            <span className="department-university-meta">
              {university.acronym} · Semestre {university.currentTerm}
            </span>
          </>
        ) : (
          <h1>Departamentos</h1>
        )}
      </header>

      <p className="catalog-cross-link">
        <Link to="/unidades">Explorar unidades acadêmicas e referências de cursos →</Link>
      </p>

      <section aria-labelledby="departments-title">
        <div className="catalog-results-heading">
          <div>
            <h2 id="departments-title">Departamentos</h2>
            {!loading && !error && <p>{totalElements} departamentos</p>}
          </div>
        </div>

        {loading ? (
          <p className="notice" role="status">
            Carregando universidade e departamentos…
          </p>
        ) : error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : departments.length ? (
          <>
            <div className="entity-directory-grid">
              {departments.map((department) => (
                <DepartmentCard key={department.id} department={department} />
              ))}
            </div>
            <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        ) : (
          <div className="empty-state">
            <strong>Nenhum departamento publicado</strong>
            <span>Os departamentos cadastrados no Campus aparecerão aqui.</span>
          </div>
        )}
      </section>
    </div>
  );
}

export function DepartmentDetailPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { departmentId = "" } = useParams();
  const [department, setDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTerm, setCurrentTerm] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseError, setCourseError] = useState("");
  const [courseSaving, setCourseSaving] = useState(false);
  const [selectedTab, setSelectedTab] = useInstitutionalProfileTab();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getUniversity(keycloak.token ?? "")
      .then((university) => active && setCurrentTerm(university.currentTerm))
      .catch(() => undefined);

    getDepartment(keycloak.token ?? "", departmentId)
      .then((result) => {
        if (!active) return;
        setDepartment(result);
        document.title = `UNIR — ${result.name}`;
        setLoading(false);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(statusMessage(requestError));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [departmentId, keycloak]);

  async function addCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!courseName.trim()) return;
    setCourseSaving(true);
    setCourseError("");
    try {
      await createDepartmentCourse(keycloak.token ?? "", departmentId, courseName.trim());
      setCourseName("");
      setDepartment(await getDepartment(keycloak.token ?? "", departmentId));
    } catch (requestError) {
      setCourseError(
        requestError instanceof CampusApiError && requestError.status === 403
          ? "Somente administradores do departamento podem cadastrar cursos."
          : "Não foi possível cadastrar o curso.",
      );
    } finally {
      setCourseSaving(false);
    }
  }

  return (
    <div className="detail-page">
      <Link className="back-link" to="/departamentos">
        ← Voltar aos departamentos
      </Link>
      {loading ? (
        <p className="notice" role="status">
          Carregando departamento…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : department ? (
        <>
          <article className="detail-main-card">
            <div className="campus-institution-heading">
              {department.logoUrl && (
                <img className="campus-space-detail-logo" src={department.logoUrl} alt={`Logo de ${department.name}`} />
              )}
              <div>
                <p className="eyebrow">{department.acronym} · Departamento</p>
                <h1>{department.name}</h1>
                <p className="detail-lead">{department.description}</p>
              </div>
              <FollowControl token={keycloak.token ?? ""} type="DEPARTMENT" profileId={department.id} />
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
              <article className="detail-main-card">
                {department.sourceUrl && (
                  <p className="department-source-link">
                    <a href={department.sourceUrl} target="_blank" rel="noreferrer">
                      Fonte institucional
                    </a>
                  </p>
                )}
                <section className="detail-copy-section">
                  <h2>Informações do departamento</h2>
                  <MarkdownContent value={department.generalInfoMarkdown} />
                </section>
                <InstitutionalLinks links={department.links} />
                <section className="detail-copy-section" aria-labelledby="department-courses-title">
                  <h2 id="department-courses-title">Cursos do departamento</h2>
                  {department.courses?.length ? (
                    <ul className="catalog-course-list">
                      {department.courses.map((course) => (
                        <li key={course.id}>{course.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Nenhum curso cadastrado para este departamento.</p>
                  )}
                  {department.viewerCanManage && (
                    <form className="campus-course-form" onSubmit={(event) => void addCourse(event)}>
                      <label className="field">
                        <span>Novo curso</span>
                        <input
                          maxLength={255}
                          value={courseName}
                          onChange={(event) => setCourseName(event.target.value)}
                          placeholder="Nome do curso"
                        />
                      </label>
                      <button
                        className="button button-secondary"
                        disabled={courseSaving || !courseName.trim()}
                        type="submit"
                      >
                        {courseSaving ? "Salvando…" : "Cadastrar curso"}
                      </button>
                      {courseError && (
                        <p className="notice notice-error" role="alert">
                          {courseError}
                        </p>
                      )}
                    </form>
                  )}
                </section>
                <InstitutionalProfileEditor
                  token={keycloak.token ?? ""}
                  type="DEPARTMENT"
                  profileId={department.id}
                  profile={department}
                  onSaved={(updated) =>
                    setDepartment((current) => current && ({ ...current, ...updated } as Department))
                  }
                />
              </article>
            )}
          </section>
          <section
            id="profile-panel-posts"
            role="tabpanel"
            aria-labelledby="profile-tab-posts"
            hidden={selectedTab !== "posts"}
          >
            {selectedTab === "posts" && currentTerm && (
              <InstitutionalPostsPanel
                token={keycloak.token ?? ""}
                type="DEPARTMENT"
                profileId={department.id}
                currentTerm={currentTerm}
                canManage={Boolean(department.viewerCanManage)}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
