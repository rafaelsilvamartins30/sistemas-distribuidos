import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { DepartmentCard } from "../components/DepartmentCard";
import {
  CampusApiError,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "UNIR — Departamentos";
    let active = true;

    Promise.all([getUniversity(keycloak.token ?? ""), getDepartments(keycloak.token ?? "")])
      .then(([universityResult, departmentPage]) => {
        if (!active) return;
        setUniversity(universityResult);
        setDepartments(departmentPage.items);
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
  }, [keycloak]);

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

      <section aria-labelledby="departments-title">
        <div className="catalog-results-heading">
          <div>
            <h2 id="departments-title">Departamentos</h2>
            {!loading && !error && <p>{departments.length} departamentos</p>}
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
          <div className="entity-directory-grid">
            {departments.map((department) => (
              <DepartmentCard key={department.id} department={department} />
            ))}
          </div>
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

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

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
        <article className="detail-main-card">
          <p className="eyebrow">{department.acronym}</p>
          <h1>{department.name}</h1>
          <p className="detail-lead">{department.description}</p>
          <section className="detail-copy-section">
            <h2>Informações do departamento</h2>
            <p className="department-markdown">{department.generalInfoMarkdown}</p>
          </section>
        </article>
      ) : null}
    </div>
  );
}
