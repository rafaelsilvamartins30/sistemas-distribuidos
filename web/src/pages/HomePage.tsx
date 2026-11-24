import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { FollowedFeed } from "../components/CampusSocial";
import { Icon } from "../components/Icon";
import { useToast } from "../contexts/ToastContext";
import {
  getAcademicEntities,
  getAcademicUnits,
  getCommunities,
  getDepartments,
  getUniversity,
  type AcademicUnit,
  type AcademicEntity,
  type Community,
  type Department,
  type University,
} from "../services/campus";
import { campusProfilePath, type CampusProfileType } from "../utils/profileRoutes";

interface WebContext {
  keycloak: Keycloak;
}

interface HomeProfile {
  type: CampusProfileType;
  id: string;
  name: string;
  description: string;
  category: string;
  marker: string;
}

function typeLabel(value: string): string {
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

function mapHomeProfiles(
  university: University | null,
  units: AcademicUnit[],
  departments: Department[],
  entities: AcademicEntity[],
  communities: Community[],
): HomeProfile[] {
  return [
    ...(university
      ? [
          {
            type: "UNIVERSITY" as const,
            id: university.id,
            name: university.name,
            description: university.description,
            category: university.acronym ? `Universidade · ${university.acronym}` : "Universidade",
            marker: university.acronym || initials(university.name),
          },
        ]
      : []),
    ...units.map((unit) => ({
      type: "ACADEMIC_UNIT" as const,
      id: unit.id,
      name: unit.name,
      description: unit.description,
      category: `Unidade acadêmica · ${unit.code}`,
      marker: unit.code || initials(unit.name),
    })),
    ...departments.map((department) => ({
      type: "DEPARTMENT" as const,
      id: department.id,
      name: department.name,
      description: department.description,
      category: department.acronym ? `Departamento · ${department.acronym}` : "Departamento",
      marker: department.acronym || initials(department.name),
    })),
    ...entities.map((entity) => ({
      type: "ACADEMIC_ENTITY" as const,
      id: entity.id,
      name: entity.name,
      description: entity.description,
      category: typeLabel(entity.entityType),
      marker: initials(entity.name),
    })),
    ...communities.map((community) => ({
      type: "COMMUNITY" as const,
      id: community.id,
      name: community.name,
      description: community.description,
      category: community.category ? `Comunidade · ${typeLabel(community.category)}` : "Comunidade",
      marker: initials(community.name),
    })),
  ].sort((left, right) => {
    if (left.type === "UNIVERSITY") return right.type === "UNIVERSITY" ? 0 : -1;
    if (right.type === "UNIVERSITY") return 1;
    return left.name.localeCompare(right.name, "pt-BR");
  });
}

export function HomePage() {
  const { keycloak } = useOutletContext<WebContext>();
  const toast = useToast();
  const [profiles, setProfiles] = useState<HomeProfile[]>([]);
  const [campusLoading, setCampusLoading] = useState(true);
  const [campusError, setCampusError] = useState(false);

  useEffect(() => {
    document.title = "UNIR — Publicações";
    let active = true;

    Promise.allSettled([
      getUniversity(keycloak.token ?? ""),
      getAcademicUnits(keycloak.token ?? "", 0, 20),
      getDepartments(keycloak.token ?? ""),
      getAcademicEntities(keycloak.token ?? ""),
      getCommunities(keycloak.token ?? ""),
    ]).then(([university, units, departments, entities, communities]) => {
      if (!active) return;
      const failed = [university, units, departments, entities, communities].filter(
        (result) => result.status === "rejected",
      ).length;
      setCampusError(failed === 5);
      if (failed === 5) toast.error("Não foi possível carregar os perfis do campus.");
      setProfiles(
        mapHomeProfiles(
          university.status === "fulfilled" ? university.value : null,
          units.status === "fulfilled" ? units.value.items : [],
          departments.status === "fulfilled" ? departments.value.items : [],
          entities.status === "fulfilled" ? entities.value.items : [],
          communities.status === "fulfilled" ? communities.value.items : [],
        ),
      );
      setCampusLoading(false);
    });

    return () => {
      active = false;
    };
  }, [keycloak, toast]);

  return (
    <div className="home-page">
      <div className="home-feed-layout">
        <section className="home-feed-main" aria-label="Publicações institucionais e conversas das comunidades">
          <FollowedFeed
            token={keycloak.token ?? ""}
            viewerName={String(keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || "Você")}
          />
        </section>

        <aside className="home-side-column" aria-label="Explorar o Campus">
          <section
            className="home-section home-section-compact home-profiles-section"
            aria-labelledby="campus-profiles-title"
          >
            <div className="home-section-heading">
              <div>
                <p className="eyebrow">Descubra quem seguir</p>
                <h2 id="campus-profiles-title">Perfis do campus</h2>
              </div>
              <Link className="section-anchor-link" to="/perfis" aria-label="Explorar todos os perfis do campus">
                Explorar <Icon name="arrowUpRight" width="15" height="15" />
              </Link>
            </div>
            <p className="home-profiles-intro">
              Universidade, unidades, departamentos, entidades e comunidades em um só lugar.
            </p>
            {campusLoading ? (
              <p className="notice" role="status">
                Carregando perfis…
              </p>
            ) : !campusError && profiles.length ? (
              <div className="home-record-list">
                {profiles.slice(0, 4).map((profile) => (
                  <Link
                    className="home-record-link home-profile-link"
                    key={`${profile.type}:${profile.id}`}
                    to={campusProfilePath(profile.type, profile.id)}
                  >
                    <span className="home-record-mark">{profile.marker}</span>
                    <span>
                      <small>{profile.category}</small>
                      <strong>{profile.name}</strong>
                      <small className="home-profile-description">{profile.description}</small>
                    </span>
                    <Icon name="arrowUpRight" width="15" height="15" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="notice">Nenhum perfil cadastrado no campus.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
