import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import { useEventList } from "../hooks/useEventList";
import {
  getAcademicEntities,
  getCommunities,
  getDepartments,
  getUniversity,
  type AcademicEntity,
  type Community,
  type Department,
  type University,
} from "../services/campus";

interface WebContext {
  keycloak: Keycloak;
}

interface HomeCampusData {
  university: University;
  departments: Department[];
  entities: AcademicEntity[];
  communities: Community[];
}

function eventDay(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(new Date(value));
}

function eventMonth(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(value))
    .replace(".", "")
    .toLocaleUpperCase("pt-BR");
}

function eventTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function HomePage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { events, loading: eventsLoading, error: eventsError } = useEventList(keycloak);
  const [campusData, setCampusData] = useState<HomeCampusData | null>(null);
  const [campusLoading, setCampusLoading] = useState(true);
  const [campusError, setCampusError] = useState(false);

  useEffect(() => {
    document.title = "UNIR — Início";
    let active = true;

    Promise.all([
      getUniversity(keycloak.token ?? ""),
      getDepartments(keycloak.token ?? ""),
      getAcademicEntities(keycloak.token ?? ""),
      getCommunities(keycloak.token ?? ""),
    ])
      .then(([university, departments, entities, communities]) => {
        if (!active) return;
        setCampusData({
          university,
          departments: departments.items,
          entities: entities.items,
          communities: communities.items,
        });
        setCampusLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCampusError(true);
        setCampusLoading(false);
      });

    return () => {
      active = false;
    };
  }, [keycloak]);

  const university = campusData?.university;

  return (
    <div className="home-page">
      <section className="university-hero" id="inicio" aria-labelledby="home-title">
        <div className="university-hero-copy">
          <span className="university-label">
            <span className="university-label-dot" />{" "}
            {university ? `${university.acronym} · Rede universitária` : "REDE UNIVERSITÁRIA"}
          </span>
          <h1 id="home-title">
            Conheça a <span>{university?.name ?? "UNIR"}</span>
          </h1>
          <p className="university-hero-description">
            {university?.description ?? "Consulte as informações e os espaços cadastrados no Campus."}
          </p>
          {university && (
            <div className="home-user-context">
              <span>{university.acronym}</span>
              <span className="context-divider" aria-hidden="true" />
              <span>Semestre {university.currentTerm}</span>
            </div>
          )}
        </div>
        <div className="university-hero-art" aria-hidden="true">
          <div className="hero-art-orbit hero-art-orbit-one" />
          <div className="hero-art-orbit hero-art-orbit-two" />
          <div className="hero-art-card">
            <span className="hero-art-overline">REDE UNIVERSITÁRIA</span>
            <strong>{university?.acronym ?? "UNIR"}</strong>
            <span>{university?.currentTerm ? `Semestre ${university.currentTerm}` : "Campus"}</span>
          </div>
          <span className="hero-art-spark hero-art-spark-one">✳</span>
          <span className="hero-art-spark hero-art-spark-two">✳</span>
        </div>
        {university && <span className="university-hero-caption">{university.name}</span>}
      </section>

      <div className="home-section-grid">
        <div className="home-main-column">
          <section className="home-section" aria-labelledby="departments-title">
            <div className="home-section-heading">
              <div>
                <p className="home-section-eyebrow">Estrutura universitária</p>
                <h2 id="departments-title">Departamentos</h2>
              </div>
              <Link className="section-anchor-link" to="/departamentos">
                Ver todos <Icon name="arrowUpRight" width="15" height="15" />
              </Link>
            </div>
            {campusLoading ? (
              <p className="notice" role="status">
                Carregando dados do Campus…
              </p>
            ) : campusError ? (
              <p className="notice notice-error" role="alert">
                Não foi possível carregar os dados do Campus.
              </p>
            ) : campusData?.departments.length ? (
              <div className="home-record-list">
                {campusData.departments.slice(0, 3).map((department) => (
                  <Link className="home-record-link" key={department.id} to={`/departamentos/${department.id}`}>
                    <span className="home-record-mark">{department.acronym}</span>
                    <span>
                      <strong>{department.name}</strong>
                      <small>{department.description}</small>
                    </span>
                    <Icon name="arrowUpRight" width="15" height="15" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="notice">Ainda não há departamentos cadastrados.</p>
            )}
          </section>

          <section className="home-section" aria-labelledby="entities-title">
            <div className="home-section-heading">
              <div>
                <p className="home-section-eyebrow">Espaços acadêmicos</p>
                <h2 id="entities-title">Entidades acadêmicas</h2>
              </div>
              <Link className="section-anchor-link" to="/entidades">
                Explorar <Icon name="arrowUpRight" width="15" height="15" />
              </Link>
            </div>
            {campusLoading ? (
              <p className="notice" role="status">
                Carregando entidades…
              </p>
            ) : campusError ? (
              <p className="notice notice-error" role="alert">
                Não foi possível carregar as entidades.
              </p>
            ) : campusData?.entities.length ? (
              <div className="home-record-list">
                {campusData.entities.slice(0, 3).map((entity) => (
                  <Link className="home-record-link" key={entity.id} to={`/entidades/${entity.id}`}>
                    <span className="home-record-mark">
                      <Icon name="profile" width="17" height="17" />
                    </span>
                    <span>
                      <strong>{entity.name}</strong>
                      <small>
                        {entity.entityType} · {entity.description}
                      </small>
                    </span>
                    <Icon name="arrowUpRight" width="15" height="15" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="notice">Ainda não há entidades acadêmicas cadastradas.</p>
            )}
          </section>
        </div>

        <aside className="home-side-column">
          <section className="home-section" aria-labelledby="communities-title">
            <div className="home-section-heading">
              <div>
                <p className="home-section-eyebrow">Espaços universitários</p>
                <h2 id="communities-title">Comunidades</h2>
              </div>
              <Link className="section-anchor-link" to="/comunidades">
                Explorar <Icon name="arrowUpRight" width="15" height="15" />
              </Link>
            </div>
            {campusLoading ? (
              <p className="notice" role="status">
                Carregando comunidades…
              </p>
            ) : campusError ? (
              <p className="notice notice-error" role="alert">
                Não foi possível carregar as comunidades.
              </p>
            ) : campusData?.communities.length ? (
              <div className="home-record-list">
                {campusData.communities.slice(0, 3).map((community) => (
                  <Link className="home-record-link" key={community.id} to={`/comunidades/${community.id}`}>
                    <span className="home-record-mark">
                      <Icon name="communities" width="17" height="17" />
                    </span>
                    <span>
                      <strong>{community.name}</strong>
                      <small>
                        {community.category || "Comunidade"} · {community.description}
                      </small>
                    </span>
                    <Icon name="arrowUpRight" width="15" height="15" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="notice">Ainda não há comunidades cadastradas.</p>
            )}
          </section>

          <section className="home-section" id="eventos" aria-labelledby="events-title">
            <div className="home-section-heading">
              <div>
                <p className="home-section-eyebrow">Agenda</p>
                <h2 id="events-title">Próximos eventos</h2>
              </div>
              <Link className="section-anchor-link" to="/eventos">
                Ver eventos <Icon name="arrowUpRight" width="15" height="15" />
              </Link>
            </div>
            {eventsLoading ? (
              <p className="notice" role="status">
                Carregando eventos…
              </p>
            ) : eventsError ? (
              <p className="notice notice-error" role="alert">
                Não foi possível carregar os eventos.
              </p>
            ) : events.length ? (
              <div className="event-list">
                {events.slice(0, 3).map((event) => (
                  <article className="event-row" key={event.id}>
                    <div className="event-date">
                      <strong>{eventDay(event.startsAt)}</strong>
                      <span>{eventMonth(event.startsAt)}</span>
                    </div>
                    <div className="event-details">
                      <div className="event-title-line">
                        <h3>
                          <Link to={`/eventos/${event.id}`}>{event.title}</Link>
                        </h3>
                      </div>
                      <p>{event.category}</p>
                      <div className="event-meta">
                        <span>
                          <Icon name="calendar" width="14" height="14" /> {eventTime(event.startsAt)}
                        </span>
                        <span>
                          <Icon name="pin" width="14" height="14" /> {event.location}
                        </span>
                      </div>
                    </div>
                    <Icon className="event-arrow" name="arrowUpRight" width="17" height="17" />
                  </article>
                ))}
              </div>
            ) : (
              <p className="notice">Ainda não há eventos publicados.</p>
            )}
          </section>
        </aside>
      </div>
      <footer className="home-footer">
        <span>{university ? `${university.acronym} · ${university.name}` : "UNIR · Rede universitária"}</span>
        <Link to="/perfil">Meu perfil</Link>
      </footer>
    </div>
  );
}
