import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
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
  getAcademicUnit,
  getAcademicUnits,
  getUniversity,
  type AcademicUnit,
} from "../services/campus";

interface WebContext {
  keycloak: Keycloak;
}

function errorMessage(error: unknown): string {
  if (error instanceof CampusApiError && error.status === 404) return "Esta unidade não foi encontrada.";
  return "Não foi possível carregar o catálogo acadêmico. Tente novamente.";
}

export function AcademicUnitsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [units, setUnits] = useState<AcademicUnit[]>([]);
  const [page, setPage] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "UNIR — Unidades acadêmicas";
    let active = true;
    setLoading(true);
    setError("");

    getAcademicUnits(keycloak.token ?? "", page, 20)
      .then((result) => {
        if (!active) return;
        setUnits(result.items);
        setTotalElements(result.totalElements);
        setTotalPages(result.totalPages);
      })
      .catch((requestError: unknown) => {
        if (active) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [keycloak, page]);

  return (
    <div className="catalog-page">
      <header className="page-intro product-page-intro">
        <p className="eyebrow">Catálogo acadêmico</p>
        <h1>Unidades acadêmicas</h1>
        <p>Perfis institucionais de unidades acadêmicas cadastradas no Campus.</p>
      </header>

      <section aria-labelledby="academic-units-title">
        <div className="catalog-results-heading">
          <div>
            <h2 id="academic-units-title">Unidades acadêmicas</h2>
            {!loading && !error && <p>{totalElements} unidades</p>}
          </div>
          <Link className="section-anchor-link" to="/perfis?tipo=departamentos">
            Ver departamentos
          </Link>
        </div>
        {loading ? (
          <p className="notice" role="status">
            Carregando unidades…
          </p>
        ) : error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : units.length ? (
          <>
            <div className="entity-directory-grid">
              {units.map((unit) => (
                <article className="entity-directory-card" key={unit.id}>
                  <p className="eyebrow">{unit.code}</p>
                  <h3>
                    <Link to={`/unidades/${encodeURIComponent(unit.id)}`}>{unit.name}</Link>
                  </h3>
                  <p>{unit.description}</p>
                  {unit.referenceOnly && <small className="department-university-meta">Registro de referência</small>}
                </article>
              ))}
            </div>
            <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        ) : (
          <div className="empty-state">
            <strong>Nenhuma unidade cadastrada</strong>
          </div>
        )}
      </section>
    </div>
  );
}

export function AcademicUnitDetailPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { unitId = "" } = useParams();
  const [unit, setUnit] = useState<AcademicUnit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTerm, setCurrentTerm] = useState("");
  const [selectedTab, setSelectedTab] = useInstitutionalProfileTab();

  useEffect(() => {
    let active = true;
    getUniversity(keycloak.token ?? "")
      .then((university) => active && setCurrentTerm(university.currentTerm))
      .catch(() => undefined);
    setLoading(true);
    setError("");
    getAcademicUnit(keycloak.token ?? "", unitId)
      .then((result) => {
        if (!active) return;
        setUnit(result);
        document.title = `UNIR — ${result.name}`;
      })
      .catch((requestError: unknown) => {
        if (active) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [keycloak, unitId]);

  return (
    <div className="detail-page">
      <Link className="back-link" to="/unidades">
        ← Voltar às unidades
      </Link>
      {loading ? (
        <p className="notice" role="status">
          Carregando unidade…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : unit ? (
        <>
          <article className="detail-main-card">
            <div className="campus-institution-heading">
              {unit.logoUrl && (
                <img className="campus-space-detail-logo" src={unit.logoUrl} alt={`Logo de ${unit.name}`} />
              )}
              <div>
                <p className="eyebrow">{unit.code} · Unidade acadêmica</p>
                <h1>{unit.name}</h1>
                <p className="detail-lead">{unit.description}</p>
              </div>
              <FollowControl token={keycloak.token ?? ""} type="ACADEMIC_UNIT" profileId={unit.id} />
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
                {unit.sourceUrl && (
                  <p>
                    <a href={unit.sourceUrl} target="_blank" rel="noreferrer">
                      Fonte institucional
                    </a>
                  </p>
                )}
                <section className="detail-copy-section">
                  <h2>Informações da unidade</h2>
                  <MarkdownContent value={unit.generalInfoMarkdown} />
                </section>
                <InstitutionalLinks links={unit.links} />
                <InstitutionalProfileEditor
                  token={keycloak.token ?? ""}
                  type="ACADEMIC_UNIT"
                  profileId={unit.id}
                  profile={unit}
                  onSaved={(updated) => setUnit((current) => current && ({ ...current, ...updated } as AcademicUnit))}
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
                type="ACADEMIC_UNIT"
                profileId={unit.id}
                currentTerm={currentTerm}
                canManage={Boolean(unit.viewerCanManage)}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
