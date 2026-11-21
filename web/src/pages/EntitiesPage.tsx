import { useEffect, useState } from "react";
import { Link, useLocation, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { CampusSpaceCard } from "../components/CampusSpaceCard";
import { FollowControl, InstitutionalPostsPanel } from "../components/CampusSocial";
import { Icon } from "../components/Icon";
import { InstitutionalProfileEditor } from "../components/InstitutionalProfileEditor";
import {
  InstitutionalLinks,
  InstitutionalProfileTabs,
  MarkdownContent,
  useInstitutionalProfileTab,
} from "../components/InstitutionalProfileContent";
import { RequestProfileForm } from "./CampusRequestsPage";
import { PaginationControls } from "../components/PaginationControls";
import {
  CampusApiError,
  getAcademicEntities,
  getAcademicEntity,
  getCommunity,
  getUniversity,
  type AcademicEntity,
  type Community,
} from "../services/campus";

interface WebContext {
  keycloak: Keycloak;
}

function errorMessage(error: unknown): string {
  if (error instanceof CampusApiError && error.status === 404) return "Este registro não foi encontrado.";
  return "Não foi possível carregar os dados do Campus. Tente novamente.";
}

export function EntitiesPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [entities, setEntities] = useState<AcademicEntity[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "UNIR — Entidades acadêmicas";
    let active = true;
    setLoading(true);
    setError(null);
    getAcademicEntities(keycloak.token ?? "", page)
      .then((result) => {
        if (!active) return;
        setEntities(result.items);
        setTotalPages(result.totalPages);
        setTotalElements(result.totalElements);
        setLoading(false);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(errorMessage(requestError));
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
        <h1>Entidades acadêmicas</h1>
        <p>Consulte as entidades cadastradas no Campus da UNIR.</p>
      </header>
      <div className="catalog-results-heading">
        <div>
          <h2>Entidades acadêmicas</h2>
          {!loading && !error && <p>{totalElements} entidades cadastradas</p>}
        </div>
        <Link className="text-link" to="/comunidades">
          Explorar comunidades <Icon name="arrowUpRight" width="15" height="15" />
        </Link>
        <RequestProfileForm token={keycloak.token ?? ""} type="ENTITY_CREATION" />
      </div>

      {loading ? (
        <p className="notice" role="status">
          Carregando entidades…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : entities.length ? (
        <div className="entity-directory-grid">
          {entities.map((entity) => (
            <CampusSpaceCard
              key={entity.id}
              id={entity.id}
              name={entity.name}
              description={entity.description}
              kind={entity.entityType}
              detailPath={`/entidades/${encodeURIComponent(entity.id)}`}
              logoUrl={entity.logoUrl}
              bannerUrl={entity.bannerUrl}
              referenceNotice={
                entity.referenceOnly ? "Referência institucional; atividade atual não verificada" : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Nenhuma entidade acadêmica cadastrada</strong>
          <span>As entidades publicadas pelo Campus aparecerão aqui.</span>
        </div>
      )}
      {!loading && !error && <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />}
    </div>
  );
}

export function EntityDetailPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { entityId, communityId, spaceId } = useParams();
  const location = useLocation();
  const isCommunity = location.pathname.startsWith("/comunidades/") || location.pathname.startsWith("/espacos/");
  const recordId = communityId ?? (isCommunity ? spaceId : entityId) ?? "";
  const [record, setRecord] = useState<AcademicEntity | Community | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTerm, setCurrentTerm] = useState("");
  const [selectedTab, setSelectedTab] = useInstitutionalProfileTab();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getUniversity(keycloak.token ?? "")
      .then((university) => active && setCurrentTerm(university.currentTerm))
      .catch(() => undefined);

    const loadRecord = isCommunity
      ? getCommunity(keycloak.token ?? "", recordId)
      : getAcademicEntity(keycloak.token ?? "", recordId);

    loadRecord
      .then((result) => {
        if (!active) return;
        setRecord(result);
        document.title = `UNIR — ${result.name}`;
        setLoading(false);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(errorMessage(requestError));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isCommunity, keycloak, recordId]);

  const backPath = isCommunity ? "/comunidades" : "/entidades";
  const kind = record && "entityType" in record ? record.entityType : record?.category || "Comunidade";

  return (
    <div className="detail-page campus-space-detail-page">
      <Link className="back-link" to={backPath}>
        <Icon name="arrowLeft" width="16" height="16" /> Voltar para {isCommunity ? "comunidades" : "entidades"}
      </Link>
      {loading ? (
        <p className="notice" role="status">
          Carregando registro…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : record ? (
        <>
          {record.bannerUrl && <img className="campus-space-detail-banner" src={record.bannerUrl} alt="" />}
          <article className="detail-main-card">
            <div className="campus-institution-heading">
              {record.logoUrl && (
                <img className="campus-space-detail-logo" src={record.logoUrl} alt={`Logo de ${record.name}`} />
              )}
              <div>
                <p className="eyebrow">{kind}</p>
                <h1>{record.name}</h1>
                <p className="detail-lead">{record.description}</p>
              </div>
              <FollowControl
                token={keycloak.token ?? ""}
                type={isCommunity ? "COMMUNITY" : "ACADEMIC_ENTITY"}
                profileId={record.id}
              />
              {isCommunity && (
                <Link className="button button-secondary" to={`/comunidades/${encodeURIComponent(record.id)}/central`}>
                  Abrir central da comunidade
                </Link>
              )}
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
                {"referenceOnly" in record && record.referenceOnly && (
                  <p className="catalog-reference-notice">
                    Referência institucional. A atividade atual não foi verificada.
                  </p>
                )}
                {"sourceAffiliationText" in record && record.sourceAffiliationText && (
                  <section className="detail-copy-section">
                    <h2>Texto de afiliação na fonte</h2>
                    <p>{record.sourceAffiliationText}</p>
                    <small>Este texto foi preservado como referência e não cria vínculo com um departamento.</small>
                  </section>
                )}
                {"sourceUrl" in record && record.sourceUrl && (
                  <p className="department-source-link">
                    <a href={record.sourceUrl} target="_blank" rel="noreferrer">
                      Abrir fonte institucional
                    </a>
                  </p>
                )}
                {"departmentId" in record && record.departmentId && (
                  <p className="campus-space-department-link">
                    <Link to={`/departamentos/${encodeURIComponent(record.departmentId)}`}>
                      Ver departamento vinculado
                    </Link>
                  </p>
                )}
                <section className="detail-copy-section">
                  <h2>Informações gerais</h2>
                  <MarkdownContent value={record.generalInfoMarkdown} />
                </section>
                <InstitutionalLinks links={record.links} />
                <InstitutionalProfileEditor
                  token={keycloak.token ?? ""}
                  type={isCommunity ? "COMMUNITY" : "ACADEMIC_ENTITY"}
                  profileId={record.id}
                  profile={record}
                  onSaved={(updated) =>
                    setRecord((current) => current && ({ ...current, ...updated } as AcademicEntity | Community))
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
                type={isCommunity ? "COMMUNITY" : "ACADEMIC_ENTITY"}
                profileId={record.id}
                currentTerm={currentTerm}
                canManage={Boolean(record.viewerCanManage)}
              />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
