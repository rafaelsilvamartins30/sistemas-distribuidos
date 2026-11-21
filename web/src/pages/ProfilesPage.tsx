import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { CommunitySpacePanel, FollowControl, InstitutionalPostsPanel } from "../components/CampusSocial";
import { Icon } from "../components/Icon";
import { InstitutionalProfileEditor } from "../components/InstitutionalProfileEditor";
import {
  InstitutionalLinks,
  InstitutionalProfileTabs,
  MarkdownContent,
  useInstitutionalProfileTab,
} from "../components/InstitutionalProfileContent";
import { RequestProfileForm } from "./CampusRequestsPage";
import {
  CampusApiError,
  createSemester,
  createUniversityProfile,
  createDepartmentCourse,
  getAcademicEntities,
  getAcademicEntity,
  getAcademicUnit,
  getAcademicUnits,
  getCommunities,
  getCommunity,
  getDepartment,
  getDepartments,
  getUniversity,
  getSemesters,
  updateSemester,
  type AcademicUnit,
  type AcademicEntity,
  type CampusPage,
  type Community,
  type Department,
  type University,
  type Semester,
} from "../services/campus";
import {
  campusProfilePath,
  campusProfileTypeFromFilter,
  campusProfileTypeFromSlug,
  profileFilterPath,
  type CampusProfileType,
} from "../utils/profileRoutes";

interface WebContext {
  keycloak: Keycloak;
}

type ProfileRecord = University | AcademicUnit | Department | AcademicEntity | Community;

interface ProfileSummary {
  type: CampusProfileType;
  id: string;
  name: string;
  description: string;
  category: string;
  marker: string;
  logoUrl: string | null;
  bannerUrl: string | null;
}

const PROFILE_TYPES: CampusProfileType[] = [
  "UNIVERSITY",
  "ACADEMIC_UNIT",
  "DEPARTMENT",
  "ACADEMIC_ENTITY",
  "COMMUNITY",
];
const DIRECTORY_SIZE = 20;

const PROFILE_LABELS: Record<CampusProfileType, string> = {
  UNIVERSITY: "Universidade",
  ACADEMIC_UNIT: "Unidade acadêmica",
  DEPARTMENT: "Departamento",
  ACADEMIC_ENTITY: "Entidade acadêmica",
  COMMUNITY: "Comunidade",
};

const FILTER_LABELS: Record<CampusProfileType, string> = {
  UNIVERSITY: "Universidade",
  ACADEMIC_UNIT: "Unidades acadêmicas",
  DEPARTMENT: "Departamentos",
  ACADEMIC_ENTITY: "Entidades acadêmicas",
  COMMUNITY: "Comunidades",
};

function humanize(value: string | null | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  const labels: Record<string, string> = {
    NUCLEO_DE_ESTUDOS: "Núcleo de estudos",
    EMPRESA_JUNIOR: "Empresa júnior",
    LIGA_ACADEMICA: "Liga acadêmica",
  };
  if (labels[value]) return labels[value];
  const normalized = value.replaceAll("_", " ").toLocaleLowerCase("pt-BR");
  return normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1);
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
}

function mapProfile(type: CampusProfileType, record: ProfileRecord): ProfileSummary {
  if (type === "UNIVERSITY") {
    const university = record as University;
    return {
      type,
      id: university.id,
      name: university.name,
      description: university.description,
      category: university.acronym ? `Universidade · ${university.acronym}` : PROFILE_LABELS[type],
      marker: university.acronym || initials(university.name),
      logoUrl: university.logoUrl,
      bannerUrl: university.bannerUrl,
    };
  }
  if (type === "ACADEMIC_UNIT") {
    const unit = record as AcademicUnit;
    return {
      type,
      id: unit.id,
      name: unit.name,
      description: unit.description,
      category: unit.code ? `Unidade acadêmica · ${unit.code}` : PROFILE_LABELS[type],
      marker: unit.code || initials(unit.name),
      logoUrl: unit.logoUrl,
      bannerUrl: unit.bannerUrl,
    };
  }
  if (type === "DEPARTMENT") {
    const department = record as Department;
    return {
      type,
      id: department.id,
      name: department.name,
      description: department.description,
      category: department.acronym ? `${PROFILE_LABELS[type]} · ${department.acronym}` : PROFILE_LABELS[type],
      marker: department.acronym || initials(department.name),
      logoUrl: department.logoUrl,
      bannerUrl: department.bannerUrl,
    };
  }
  if (type === "ACADEMIC_ENTITY") {
    const entity = record as AcademicEntity;
    return {
      type,
      id: entity.id,
      name: entity.name,
      description: entity.description,
      category: humanize(entity.entityType, PROFILE_LABELS[type]),
      marker: initials(entity.name),
      logoUrl: entity.logoUrl,
      bannerUrl: entity.bannerUrl,
    };
  }
  const community = record as Community;
  return {
    type,
    id: community.id,
    name: community.name,
    description: community.description,
    category: community.category
      ? `${PROFILE_LABELS[type]} · ${humanize(community.category, "")}`
      : PROFILE_LABELS[type],
    marker: initials(community.name),
    logoUrl: community.logoUrl,
    bannerUrl: community.bannerUrl,
  };
}

function sortProfiles(profiles: ProfileSummary[]): ProfileSummary[] {
  return [...profiles].sort((left, right) => {
    if (left.type === "UNIVERSITY") return right.type === "UNIVERSITY" ? 0 : -1;
    if (right.type === "UNIVERSITY") return 1;
    return left.name.localeCompare(right.name, "pt-BR");
  });
}

function getDirectoryPage(token: string, type: CampusProfileType, page: number): Promise<CampusPage<ProfileRecord>> {
  if (type === "UNIVERSITY") {
    return getUniversity(token).then((university) => ({
      items: [university],
      page: 0,
      size: 1,
      totalElements: 1,
      totalPages: 1,
    }));
  }
  if (type === "ACADEMIC_UNIT") return getAcademicUnits(token, page, DIRECTORY_SIZE);
  if (type === "DEPARTMENT") return getDepartments(token, page, DIRECTORY_SIZE);
  if (type === "ACADEMIC_ENTITY") return getAcademicEntities(token, page, undefined, undefined, DIRECTORY_SIZE);
  return getCommunities(token, page, undefined, undefined, DIRECTORY_SIZE);
}

function getProfile(token: string, type: CampusProfileType, id: string): Promise<ProfileRecord> {
  if (type === "UNIVERSITY") return getUniversity(token);
  if (type === "ACADEMIC_UNIT") return getAcademicUnit(token, id);
  if (type === "DEPARTMENT") return getDepartment(token, id);
  if (type === "ACADEMIC_ENTITY") return getAcademicEntity(token, id);
  return getCommunity(token, id);
}

function profileError(error: unknown): string {
  if (error instanceof CampusApiError && error.status === 404) return "Este perfil não foi encontrado.";
  return "Não foi possível carregar este perfil. Tente novamente.";
}

function ProfileCard({ profile }: { profile: ProfileSummary }) {
  return (
    <Link className="profile-directory-card" to={campusProfilePath(profile.type, profile.id)}>
      <span
        className="profile-directory-cover"
        aria-hidden="true"
        style={
          profile.bannerUrl
            ? {
                backgroundImage: `linear-gradient(120deg, rgb(20 49 133 / 76%), rgb(38 66 168 / 38%)), url("${profile.bannerUrl}")`,
              }
            : undefined
        }
      >
        <span className="profile-directory-type">{PROFILE_LABELS[profile.type]}</span>
      </span>
      <span className="profile-directory-body">
        <span className="profile-directory-avatar" aria-hidden="true">
          {profile.logoUrl ? <img src={profile.logoUrl} alt="" loading="lazy" /> : profile.marker}
        </span>
        <span className="profile-directory-copy">
          <small>{profile.category}</small>
          <strong>{profile.name}</strong>
          <span>{profile.description || "Acompanhe as informações e publicações deste perfil."}</span>
        </span>
        <span className="profile-directory-open">
          Ver perfil <Icon name="arrowUpRight" width="15" height="15" />
        </span>
      </span>
    </Link>
  );
}

function UniversitySemesterAdmin({ token }: { token: string }) {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [draft, setDraft] = useState({ name: "", startOn: "", endOn: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    getSemesters(token)
      .then(({ items }) => active && setSemesters(items))
      .catch(() => active && setError("Não foi possível carregar os semestres cadastrados."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = editingId ? await updateSemester(token, editingId, draft) : await createSemester(token, draft);
      setSemesters((current) =>
        [...current.filter((semester) => semester.id !== saved.id), saved].sort((left, right) =>
          right.startOn.localeCompare(left.startOn),
        ),
      );
      setDraft({ name: "", startOn: "", endOn: "" });
      setEditingId(null);
      setMessage(`${saved.name} salvo.`);
    } catch {
      setError("Não foi possível salvar. Use o formato AAAA/1 ou AAAA/2 e confira as datas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="university-semester-admin">
      <summary>Gerenciar semestres</summary>
      <div className="university-semester-admin-content">
        <p>Cadastre os períodos acadêmicos para organizar e filtrar as publicações.</p>
        <form className="campus-semester-form" onSubmit={(event) => void save(event)}>
          <label className="field">
            <span>Semestre</span>
            <input
              required
              pattern="[0-9]{4}/[12]"
              placeholder="2026/2"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Data de início</span>
            <input
              required
              type="date"
              value={draft.startOn}
              onChange={(event) => setDraft((current) => ({ ...current, startOn: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Data de fim</span>
            <input
              required
              type="date"
              value={draft.endOn}
              onChange={(event) => setDraft((current) => ({ ...current, endOn: event.target.value }))}
            />
          </label>
          <div className="campus-semester-form-actions">
            <button className="button button-primary" disabled={saving} type="submit">
              {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Adicionar semestre"}
            </button>
            {editingId && (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setDraft({ name: "", startOn: "", endOn: "" });
                }}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="notice notice-success" role="status">
            {message}
          </p>
        )}
        {loading ? (
          <p className="notice" role="status">
            Carregando semestres…
          </p>
        ) : (
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
                    setEditingId(semester.id);
                    setDraft({ name: semester.name, startOn: semester.startOn, endOn: semester.endOn });
                  }}
                >
                  Editar
                </button>
              </div>
            ))}
            {semesters.length === 0 && <p>Nenhum semestre cadastrado.</p>}
          </div>
        )}
      </div>
    </details>
  );
}

export function ProfilesPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [pageByType, setPageByType] = useState<Record<CampusProfileType, number>>({
    UNIVERSITY: 0,
    ACADEMIC_UNIT: 0,
    DEPARTMENT: 0,
    ACADEMIC_ENTITY: 0,
    COMMUNITY: 0,
  });
  const [totalPages, setTotalPages] = useState<Record<CampusProfileType, number>>({
    UNIVERSITY: 0,
    ACADEMIC_UNIT: 0,
    DEPARTMENT: 0,
    ACADEMIC_ENTITY: 0,
    COMMUNITY: 0,
  });
  const [totalByType, setTotalByType] = useState<Record<CampusProfileType, number>>({
    UNIVERSITY: 0,
    ACADEMIC_UNIT: 0,
    DEPARTMENT: 0,
    ACADEMIC_ENTITY: 0,
    COMMUNITY: 0,
  });
  const [failedTypes, setFailedTypes] = useState<CampusProfileType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const token = keycloak.token ?? "";
  const activeType = campusProfileTypeFromFilter(searchParams.get("tipo"));

  useEffect(() => {
    document.title = "UNIR — Perfis do campus";
    let active = true;
    setLoading(true);
    Promise.allSettled(PROFILE_TYPES.map((type) => getDirectoryPage(token, type, 0))).then((results) => {
      if (!active) return;
      const failed: CampusProfileType[] = [];
      const nextProfiles: ProfileSummary[] = [];
      const nextPages: Record<CampusProfileType, number> = {
        UNIVERSITY: 0,
        ACADEMIC_UNIT: 0,
        DEPARTMENT: 0,
        ACADEMIC_ENTITY: 0,
        COMMUNITY: 0,
      };
      const nextTotals: Record<CampusProfileType, number> = {
        UNIVERSITY: 0,
        ACADEMIC_UNIT: 0,
        DEPARTMENT: 0,
        ACADEMIC_ENTITY: 0,
        COMMUNITY: 0,
      };

      results.forEach((result, index) => {
        const type = PROFILE_TYPES[index];
        if (result.status === "fulfilled") {
          nextProfiles.push(...result.value.items.map((item) => mapProfile(type, item)));
          nextPages[type] = result.value.totalPages;
          nextTotals[type] = result.value.totalElements;
        } else {
          failed.push(type);
        }
      });

      setProfiles(sortProfiles(nextProfiles));
      setPageByType({ UNIVERSITY: 0, ACADEMIC_UNIT: 0, DEPARTMENT: 0, ACADEMIC_ENTITY: 0, COMMUNITY: 0 });
      setTotalPages(nextPages);
      setTotalByType(nextTotals);
      setFailedTypes(failed);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [token]);

  const visibleProfiles = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    return profiles.filter((profile) => {
      if (activeType && profile.type !== activeType) return false;
      if (!normalizedQuery) return true;
      const searchable = `${profile.name} ${profile.category} ${profile.description}`
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
      return searchable.includes(normalizedQuery);
    });
  }, [activeType, profiles, query]);

  const relevantTypes = activeType ? [activeType] : PROFILE_TYPES;
  const matchingCount = relevantTypes.reduce((sum, type) => sum + totalByType[type], 0);
  const typesWithMore = relevantTypes.filter((type) => pageByType[type] + 1 < totalPages[type]);

  function chooseType(type: CampusProfileType | null) {
    const next = new URLSearchParams(searchParams);
    const path = profileFilterPath(type);
    const queryString = path.split("?")[1];
    if (queryString) next.set("tipo", new URLSearchParams(queryString).get("tipo") ?? "");
    else next.delete("tipo");
    setSearchParams(next, { replace: true });
  }

  async function loadMore() {
    if (!typesWithMore.length || loadingMore) return;
    setLoadingMore(true);
    const results = await Promise.allSettled(
      typesWithMore.map((type) => {
        const nextPage = pageByType[type] + 1;
        return getDirectoryPage(token, type, nextPage).then((result) => ({ type, page: nextPage, result }));
      }),
    );
    const nextProfiles: ProfileSummary[] = [];
    const succeeded: CampusProfileType[] = [];
    const failed: CampusProfileType[] = [];
    const nextPageByType = { ...pageByType };

    results.forEach((result, index) => {
      const fallbackType = typesWithMore[index];
      if (result.status === "fulfilled") {
        succeeded.push(result.value.type);
        nextPageByType[result.value.type] = result.value.page;
        nextProfiles.push(...result.value.result.items.map((item) => mapProfile(result.value.type, item)));
      } else {
        failed.push(fallbackType);
      }
    });

    setProfiles((current) =>
      sortProfiles(
        [...current, ...nextProfiles].filter(
          (profile, index, all) =>
            all.findIndex((candidate) => candidate.type === profile.type && candidate.id === profile.id) === index,
        ),
      ),
    );
    setPageByType(nextPageByType);
    setFailedTypes((current) => [...current.filter((type) => !succeeded.includes(type)), ...failed]);
    setLoadingMore(false);
  }

  return (
    <div className="profile-directory-page">
      <header className="profile-directory-header">
        <div>
          <p className="eyebrow">Descubra quem faz parte da universidade</p>
          <h1>Perfis do campus</h1>
          <p>
            Encontre a universidade, suas unidades, departamentos, entidades e comunidades para acompanhar as novidades
            da UNIR.
          </p>
        </div>
        <div className="profile-directory-summary" aria-live="polite">
          <strong>{loading ? "—" : matchingCount}</strong>
          <span>{activeType ? FILTER_LABELS[activeType].toLocaleLowerCase("pt-BR") : "perfis no campus"}</span>
        </div>
      </header>

      <section className="profile-directory-toolbar" aria-label="Buscar e filtrar perfis">
        <label className="profile-directory-search">
          <Icon name="search" width="19" height="19" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, área ou descrição"
            aria-label="Buscar perfis"
          />
        </label>
        <div className="profile-directory-filter-group">
          <span className="profile-directory-filter-label">Tipo de perfil</span>
          <div className="profile-directory-filters" role="group" aria-label="Tipo de perfil">
            <button
              aria-pressed={!activeType}
              className={!activeType ? "is-active" : ""}
              type="button"
              onClick={() => chooseType(null)}
            >
              Todos
            </button>
            {PROFILE_TYPES.map((type) => (
              <button
                key={type}
                aria-pressed={activeType === type}
                className={activeType === type ? "is-active" : ""}
                type="button"
                onClick={() => chooseType(type)}
              >
                {FILTER_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {failedTypes.length > 0 && (
        <p className="notice notice-error profile-directory-error" role="status">
          Alguns perfis não puderam ser carregados. Recarregue a página para tentar novamente.
        </p>
      )}

      {loading ? (
        <p className="notice" role="status">
          Carregando perfis…
        </p>
      ) : visibleProfiles.length ? (
        <>
          <section className="profile-directory-grid" aria-label="Perfis encontrados">
            {visibleProfiles.map((profile) => (
              <ProfileCard key={`${profile.type}:${profile.id}`} profile={profile} />
            ))}
          </section>
          {!query.trim() && typesWithMore.length > 0 && (
            <button
              className="button button-secondary profile-directory-more"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Carregando…" : "Carregar mais perfis"}
            </button>
          )}
        </>
      ) : (
        <div className="profile-directory-empty">
          <span className="profile-directory-empty-mark" aria-hidden="true">
            <Icon name="search" width="22" height="22" />
          </span>
          <strong>{query.trim() ? "Nenhum perfil encontrado" : "Ainda não há perfis neste filtro"}</strong>
          <span>
            {query.trim()
              ? "Tente buscar por outro nome ou escolha um tipo diferente."
              : "Escolha outro tipo para explorar o campus."}
          </span>
          {activeType && (
            <button type="button" className="text-link" onClick={() => chooseType(null)}>
              Ver todos os perfis
            </button>
          )}
        </div>
      )}

      <section className="profile-request-panel">
        <div>
          <p className="eyebrow">Cadastro de novos perfis</p>
          <h2>Seu espaço ainda não está aqui?</h2>
          <p>Peça a inclusão do seu espaço no diretório do campus.</p>
        </div>
        <div className="profile-request-actions">
          <RequestProfileForm token={token} type="ENTITY_CREATION" presentation="modal" />
          <RequestProfileForm token={token} type="COMMUNITY_CREATION" presentation="modal" />
        </div>
      </section>
    </div>
  );
}

export function UnifiedProfilePage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { profileType: profileTypeSlug, profileId = "" } = useParams();
  const profileType = campusProfileTypeFromSlug(profileTypeSlug);
  const [record, setRecord] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTerm, setCurrentTerm] = useState("");
  const [selectedTab, setSelectedTab] = useInstitutionalProfileTab();
  const [courseName, setCourseName] = useState("");
  const [courseError, setCourseError] = useState("");
  const [courseSaving, setCourseSaving] = useState(false);
  const [catalogKind, setCatalogKind] = useState<"ACADEMIC_UNIT" | "DEPARTMENT">("ACADEMIC_UNIT");
  const [catalogCode, setCatalogCode] = useState("");
  const [catalogName, setCatalogName] = useState("");
  const [catalogDescription, setCatalogDescription] = useState("");
  const [catalogInfo, setCatalogInfo] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [catalogMessage, setCatalogMessage] = useState("");
  const [catalogSaving, setCatalogSaving] = useState(false);
  const token = keycloak.token ?? "";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setRecord(null);
    setCurrentTerm("");

    if (!profileType || !profileId) {
      setError("Este perfil não foi encontrado.");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    getUniversity(token)
      .then((university) => active && setCurrentTerm(university.currentTerm))
      .catch(() => undefined);

    getProfile(token, profileType, profileId)
      .then((result) => {
        if (!active) return;
        setRecord(result);
        document.title = `UNIR — ${result.name}`;
        setLoading(false);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(profileError(requestError));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [profileId, profileType, token]);

  async function addCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileType !== "DEPARTMENT" || !courseName.trim()) return;
    setCourseSaving(true);
    setCourseError("");
    try {
      await createDepartmentCourse(token, profileId, courseName.trim());
      setCourseName("");
      setRecord(await getDepartment(token, profileId));
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

  async function createCatalogProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (profileType !== "UNIVERSITY" || !record?.viewerCanManage) return;
    setCatalogSaving(true);
    setCatalogError("");
    setCatalogMessage("");
    try {
      const created = (await createUniversityProfile(token, catalogKind, {
        ...(catalogKind === "DEPARTMENT" ? { acronym: catalogCode } : { code: catalogCode }),
        name: catalogName.trim(),
        description: catalogDescription.trim(),
        generalInfoMarkdown: catalogInfo.trim(),
        links: [],
      })) as { name?: string };
      const kind = catalogKind === "DEPARTMENT" ? "Departamento" : "Unidade acadêmica";
      setCatalogMessage(`${kind} ${created.name ?? catalogName.trim()} cadastrado.`);
      setCatalogCode("");
      setCatalogName("");
      setCatalogDescription("");
      setCatalogInfo("");
    } catch (requestError) {
      setCatalogError(
        requestError instanceof CampusApiError && requestError.status === 403
          ? "Somente administradores da universidade podem cadastrar perfis acadêmicos."
          : "Não foi possível cadastrar o perfil. Confira se o código já está em uso.",
      );
    } finally {
      setCatalogSaving(false);
    }
  }

  if (!profileType) {
    return (
      <div className="public-profile-page">
        <Link className="back-link" to="/perfis">
          ← Todos os perfis
        </Link>
        <p className="notice notice-error" role="alert">
          Este perfil não foi encontrado.
        </p>
      </div>
    );
  }

  let category = PROFILE_LABELS[profileType];
  if (record && profileType === "UNIVERSITY") {
    const university = record as University;
    category = university.acronym ? `Universidade · ${university.acronym}` : PROFILE_LABELS[profileType];
  } else if (record && profileType === "ACADEMIC_UNIT") {
    const unit = record as AcademicUnit;
    category = unit.code ? `Unidade acadêmica · ${unit.code}` : PROFILE_LABELS[profileType];
  } else if (record && profileType === "DEPARTMENT") {
    const department = record as Department;
    category = department.acronym ? `Departamento · ${department.acronym}` : PROFILE_LABELS[profileType];
  } else if (record && profileType === "ACADEMIC_ENTITY") {
    category = `${PROFILE_LABELS[profileType]} · ${humanize((record as AcademicEntity).entityType, "Entidade")}`;
  } else if (record && profileType === "COMMUNITY" && (record as Community).category) {
    category = `${PROFILE_LABELS[profileType]} · ${humanize((record as Community).category, "")}`;
  }
  const departmentId =
    record && ["ACADEMIC_ENTITY", "COMMUNITY"].includes(profileType)
      ? (record as AcademicEntity | Community).departmentId
      : null;
  const sourceUrl =
    record && ["ACADEMIC_UNIT", "DEPARTMENT", "ACADEMIC_ENTITY"].includes(profileType)
      ? (record as AcademicUnit | Department | AcademicEntity).sourceUrl
      : null;

  return (
    <div className="public-profile-page">
      <Link className="back-link" to="/perfis">
        <Icon name="arrowLeft" width="16" height="16" /> Todos os perfis
      </Link>
      {loading ? (
        <p className="notice" role="status">
          Carregando perfil…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : record ? (
        <>
          <article className="public-profile-hero">
            <div
              className="public-profile-cover"
              aria-hidden="true"
              style={
                record.bannerUrl
                  ? {
                      backgroundImage: `linear-gradient(115deg, rgb(18 47 128 / 82%), rgb(41 74 178 / 35%)), url("${record.bannerUrl}")`,
                    }
                  : undefined
              }
            />
            <div className="public-profile-identity">
              <span className="public-profile-avatar" aria-hidden="true">
                {record.logoUrl ? <img src={record.logoUrl} alt="" /> : initials(record.name)}
              </span>
              <div className="public-profile-heading">
                <span className="public-profile-kind">{category}</span>
                <h1>{record.name}</h1>
                <p>{record.description || "Acompanhe as informações e publicações deste perfil."}</p>
              </div>
              <div className="public-profile-actions">
                <FollowControl token={token} type={profileType} profileId={record.id} />
                {profileType === "COMMUNITY" && (
                  <Link
                    className="button button-secondary"
                    to={`/comunidades/${encodeURIComponent(record.id)}/central`}
                  >
                    Abrir central da comunidade <Icon name="arrowUpRight" width="15" height="15" />
                  </Link>
                )}
              </div>
            </div>
          </article>

          <InstitutionalProfileTabs selected={selectedTab} onSelect={setSelectedTab} />
          <section
            className="public-profile-content"
            id="profile-panel-profile"
            role="tabpanel"
            aria-labelledby="profile-tab-profile"
            hidden={selectedTab !== "profile"}
          >
            {selectedTab === "profile" && (
              <div className="public-profile-overview">
                <article className="public-profile-card public-profile-about">
                  <div className="public-profile-section-heading">
                    <span className="eyebrow">Sobre</span>
                    <h2>Conheça {record.name}</h2>
                  </div>
                  {record.generalInfoMarkdown?.trim() ? (
                    <MarkdownContent value={record.generalInfoMarkdown} />
                  ) : (
                    <p className="public-profile-empty-copy">Este perfil ainda não adicionou outras informações.</p>
                  )}
                  {profileType === "DEPARTMENT" && (
                    <section className="public-profile-courses">
                      <h3>Cursos</h3>
                      {(record as Department).courses?.length ? (
                        <ul className="catalog-course-list">
                          {(record as Department).courses?.map((course) => (
                            <li key={course.id}>{course.name}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>Nenhum curso listado.</p>
                      )}
                      {(record as Department).viewerCanManage && (
                        <form className="campus-course-form" onSubmit={(event) => void addCourse(event)}>
                          <label className="field">
                            <span>Adicionar curso</span>
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
                            {courseSaving ? "Salvando…" : "Adicionar"}
                          </button>
                          {courseError && (
                            <p className="notice notice-error" role="alert">
                              {courseError}
                            </p>
                          )}
                        </form>
                      )}
                    </section>
                  )}
                  {profileType === "UNIVERSITY" && record.viewerCanManage && (
                    <section className="public-profile-courses university-profile-creation">
                      <h3>Perfis acadêmicos</h3>
                      <p>Cadastre uma unidade acadêmica ou um departamento da universidade.</p>
                      <details>
                        <summary>Cadastrar unidade ou departamento</summary>
                        <form className="campus-post-composer" onSubmit={(event) => void createCatalogProfile(event)}>
                          <label className="field">
                            <span>Tipo de perfil</span>
                            <select
                              value={catalogKind}
                              onChange={(event) => setCatalogKind(event.target.value as "ACADEMIC_UNIT" | "DEPARTMENT")}
                            >
                              <option value="ACADEMIC_UNIT">Unidade acadêmica</option>
                              <option value="DEPARTMENT">Departamento</option>
                            </select>
                          </label>
                          <label className="field">
                            <span>{catalogKind === "DEPARTMENT" ? "Sigla" : "Código"}</span>
                            <input
                              required
                              maxLength={80}
                              value={catalogCode}
                              onChange={(event) => setCatalogCode(event.target.value)}
                            />
                          </label>
                          <label className="field">
                            <span>Nome</span>
                            <input
                              required
                              maxLength={255}
                              value={catalogName}
                              onChange={(event) => setCatalogName(event.target.value)}
                            />
                          </label>
                          <label className="field">
                            <span>Descrição</span>
                            <textarea
                              required
                              rows={2}
                              value={catalogDescription}
                              onChange={(event) => setCatalogDescription(event.target.value)}
                            />
                          </label>
                          <label className="field">
                            <span>Informações gerais</span>
                            <textarea
                              required
                              rows={4}
                              value={catalogInfo}
                              onChange={(event) => setCatalogInfo(event.target.value)}
                            />
                          </label>
                          {catalogError && (
                            <p className="notice notice-error" role="alert">
                              {catalogError}
                            </p>
                          )}
                          <button className="button button-primary" disabled={catalogSaving} type="submit">
                            {catalogSaving ? "Salvando…" : "Criar perfil"}
                          </button>
                        </form>
                      </details>
                      {catalogMessage && (
                        <p className="notice notice-success" role="status">
                          {catalogMessage}
                        </p>
                      )}
                      <UniversitySemesterAdmin token={token} />
                    </section>
                  )}
                  {record.viewerCanManage && (
                    <InstitutionalProfileEditor
                      token={token}
                      type={profileType}
                      profileId={record.id}
                      profile={record}
                      onSaved={(updated) =>
                        setRecord((current) => current && ({ ...current, ...updated } as ProfileRecord))
                      }
                    />
                  )}
                </article>
                <aside className="public-profile-card public-profile-aside" aria-label="Informações do perfil">
                  <div className="public-profile-section-heading">
                    <span className="eyebrow">Perfil público</span>
                    <h2>Informações</h2>
                  </div>
                  <dl className="public-profile-facts">
                    <div>
                      <dt>Tipo</dt>
                      <dd>{PROFILE_LABELS[profileType]}</dd>
                    </div>
                    {profileType === "DEPARTMENT" && (record as Department).acronym && (
                      <div>
                        <dt>Sigla</dt>
                        <dd>{(record as Department).acronym}</dd>
                      </div>
                    )}
                    {profileType === "UNIVERSITY" && (record as University).acronym && (
                      <div>
                        <dt>Sigla</dt>
                        <dd>{(record as University).acronym}</dd>
                      </div>
                    )}
                    {profileType === "ACADEMIC_UNIT" && (record as AcademicUnit).code && (
                      <div>
                        <dt>Código</dt>
                        <dd>{(record as AcademicUnit).code}</dd>
                      </div>
                    )}
                    {profileType === "UNIVERSITY" && currentTerm && (
                      <div>
                        <dt>Semestre atual</dt>
                        <dd>{currentTerm}</dd>
                      </div>
                    )}
                    {sourceUrl && (
                      <div>
                        <dt>Site institucional</dt>
                        <dd>
                          <a href={sourceUrl} target="_blank" rel="noreferrer">
                            Abrir site <Icon name="arrowUpRight" width="14" height="14" />
                          </a>
                        </dd>
                      </div>
                    )}
                    {departmentId && (
                      <div>
                        <dt>Departamento relacionado</dt>
                        <dd>
                          <Link to={campusProfilePath("DEPARTMENT", departmentId)}>
                            Ver perfil <Icon name="arrowUpRight" width="14" height="14" />
                          </Link>
                        </dd>
                      </div>
                    )}
                  </dl>
                  {record.links?.length > 0 && <InstitutionalLinks links={record.links} />}
                </aside>
              </div>
            )}
          </section>
          <section
            className="public-profile-content"
            id="profile-panel-posts"
            role="tabpanel"
            aria-labelledby="profile-tab-posts"
            hidden={selectedTab !== "posts"}
          >
            {selectedTab === "posts" && currentTerm && (
              <div className="public-profile-posts">
                <InstitutionalPostsPanel
                  token={token}
                  type={profileType}
                  profileId={record.id}
                  profileName={record.name}
                  currentTerm={currentTerm}
                  canManage={Boolean(record.viewerCanManage)}
                />
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function CommunitySpacePage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { communityId = "" } = useParams();
  const token = keycloak.token ?? "";
  const viewerName = String(keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || "Você");
  const [community, setCommunity] = useState<Community | null>(null);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "UNIR — Central da comunidade";
    let active = true;
    setLoading(true);
    setError("");
    getCommunity(token, communityId)
      .then((result) => {
        if (!active) return;
        setCommunity(result);
        document.title = `UNIR — Central · ${result.name}`;
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(profileError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [communityId, token]);

  return (
    <div className="community-central-page">
      <Link className="back-link" to={campusProfilePath("COMMUNITY", communityId)}>
        <Icon name="arrowLeft" width="16" height="16" /> Voltar ao perfil da comunidade
      </Link>
      {loading ? (
        <p className="notice" role="status">
          Carregando comunidade…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      ) : community ? (
        <>
          <header className="community-central-hero">
            <div>
              <p className="eyebrow">Comunidade · {community.category ? humanize(community.category, "") : "Campus"}</p>
              <h1>{community.name}</h1>
              <p>{community.description || "Converse e compartilhe novidades com quem acompanha esta comunidade."}</p>
            </div>
            <FollowControl token={token} type="COMMUNITY" profileId={community.id} onChange={setFollowing} />
          </header>
          <CommunitySpacePanel
            token={token}
            communityId={community.id}
            communityName={community.name}
            viewerName={viewerName}
            following={following}
          />
        </>
      ) : null}
    </div>
  );
}
