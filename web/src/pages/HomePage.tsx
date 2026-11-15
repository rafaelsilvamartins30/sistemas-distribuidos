import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../components/Icon";
import {
  events,
  findEntity,
  findSpace,
  mockAnnouncements,
  mockCurrentUser,
  mockFollowedSpaceIds,
  mockUniversity,
  opportunities,
  spacePath,
} from "../data/demoContent";

export function HomePage() {
  const location = useLocation();
  const followedSpaces = mockFollowedSpaceIds.map(findSpace).filter((space) => space !== undefined);

  useEffect(() => {
    document.title = "UNIR — Início";
    if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
  }, [location.hash]);

  return (
    <div className="home-page">
      <section className="university-hero" id="inicio" aria-labelledby="home-title">
        <div className="university-hero-copy">
          <span className="university-label">
            <span className="university-label-dot" /> {mockUniversity.shortName} · {mockUniversity.location}
          </span>
          <p className="home-greeting">Olá, {mockCurrentUser.name.split(" ")[0]}.</p>
          <h1 id="home-title">
            O que está acontecendo na <span>{mockUniversity.shortName}?</span>
          </h1>
          <p className="university-hero-description">{mockUniversity.message}</p>
          <div className="home-user-context">
            <span>{mockCurrentUser.course}</span>
            <span className="context-divider" aria-hidden="true" />
            <span>{mockCurrentUser.department}</span>
          </div>
          <div className="home-interest-list" aria-label="Seus interesses">
            {mockCurrentUser.interests.map((interest) => (
              <span key={interest}>{interest}</span>
            ))}
          </div>
        </div>
        <div className="university-hero-art" aria-hidden="true">
          <div className="hero-art-orbit hero-art-orbit-one" />
          <div className="hero-art-orbit hero-art-orbit-two" />
          <div className="hero-art-card">
            <span className="hero-art-overline">UNIVERSIDADE FEDERAL DE LAVRAS</span>
            <strong>{mockUniversity.shortName}</strong>
            <span>Universidade que conecta</span>
          </div>
          <span className="hero-art-spark hero-art-spark-one">✳</span>
          <span className="hero-art-spark hero-art-spark-two">✳</span>
        </div>
        <span className="university-hero-caption">{mockUniversity.name}</span>
      </section>

      <div className="home-section-grid">
        <div className="home-main-column">
          <section className="home-section announcements-section" aria-labelledby="announcements-title">
            <div className="home-section-heading">
              <div>
                <p className="home-section-eyebrow">Da universidade</p>
                <h2 id="announcements-title">Comunicados importantes</h2>
              </div>
              <span className="institutional-label">
                <Icon name="check" width="14" height="14" /> Institucional
              </span>
            </div>
            <div className="announcement-list">
              {mockAnnouncements.map((announcement, index) => (
                <article
                  className={`announcement-item${index === 0 ? " announcement-item-featured" : ""}`}
                  key={announcement.id}
                >
                  <span className={`announcement-marker announcement-marker-${index}`}>
                    <Icon name={index === 2 ? "calendar" : "message"} width="17" height="17" />
                  </span>
                  <div className="announcement-copy">
                    <span className="announcement-category">{announcement.category}</span>
                    <h3>{announcement.title}</h3>
                    <p>{announcement.summary}</p>
                  </div>
                  <time>{announcement.date}</time>
                </article>
              ))}
            </div>
          </section>

          <section className="home-section entities-section" id="entidades" aria-labelledby="spaces-title">
            <div className="home-section-heading">
              <div>
                <p className="home-section-eyebrow">O que você acompanha</p>
                <h2 id="spaces-title">Entidades e comunidades</h2>
              </div>
              <Link className="section-anchor-link" to="/entidades">
                Explorar espaços <Icon name="arrowUpRight" width="15" height="15" />
              </Link>
            </div>
            <div className="followed-entities-grid">
              {followedSpaces.map((space) => (
                <article className="followed-entity-card" key={space.id}>
                  <Link
                    className="entity-avatar-link"
                    to={spacePath(space)}
                    aria-label={`Abrir página de ${space.name}`}
                  >
                    <div className={`entity-avatar entity-avatar-${space.tone}`}>{space.initials}</div>
                  </Link>
                  <div className="entity-card-copy">
                    <span>{space.spaceKind === "community" ? "Comunidade" : space.type}</span>
                    <h3>
                      <Link to={spacePath(space)}>{space.name}</Link>
                    </h3>
                    <p>{space.category}</p>
                  </div>
                  {space.posts.filter((post) => !post.pinned).length > 0 && (
                    <span className="entity-update-count" aria-label="Há publicações novas">
                      {space.posts.filter((post) => !post.pinned).length}
                    </span>
                  )}
                </article>
              ))}
            </div>
            <p className="section-footnote">
              Novas publicações aparecem no seu feed conforme você acompanha cada espaço.
            </p>
          </section>

          <section className="home-section events-section" id="eventos" aria-labelledby="events-title">
            <div className="home-section-heading">
              <div>
                <p className="home-section-eyebrow">Anote na agenda</p>
                <h2 id="events-title">Próximos eventos</h2>
              </div>
              <Link className="section-anchor-link" to="/eventos">
                Ver eventos <Icon name="arrowUpRight" width="15" height="15" />
              </Link>
            </div>
            <div className="event-list">
              {events.slice(0, 3).map((event) => {
                const organizer = findEntity(event.organizerId);
                return (
                  <article className="event-row" key={event.id}>
                    <div className="event-date">
                      <strong>{event.day}</strong>
                      <span>{event.month}</span>
                    </div>
                    <div className="event-details">
                      <div className="event-title-line">
                        <h3>
                          <Link to={`/eventos/${event.id}`}>{event.title}</Link>
                        </h3>
                        <span className="event-status">{event.vacancies}</span>
                      </div>
                      <p>{organizer?.name ?? mockUniversity.shortName}</p>
                      <div className="event-meta">
                        <span>
                          <Icon name="calendar" width="14" height="14" /> {event.time}
                        </span>
                        <span>
                          <Icon name="pin" width="14" height="14" /> {event.location}
                        </span>
                      </div>
                    </div>
                    <Icon className="event-arrow" name="arrowUpRight" width="17" height="17" />
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="home-side-column">
          <section className="home-section sports-section" id="esportes" aria-labelledby="sports-title">
            <div className="home-section-heading">
              <div>
                <p className="home-section-eyebrow">Movimente-se</p>
                <h2 id="sports-title">Esportes na UFLA</h2>
              </div>
              <Link className="section-anchor-link" to="/esportes">
                Explorar <Icon name="arrowUpRight" width="15" height="15" />
              </Link>
            </div>
            <div className="sports-highlight">
              <span className="sports-tag">Inscrições abertas</span>
              <h3>Intercursos de Futsal</h3>
              <p>Monte sua equipe ou se inscreva como agente livre.</p>
              <div className="sports-event-meta">
                <span>
                  <Icon name="calendar" width="15" height="15" /> Até 20 out.
                </span>
                <span>
                  <Icon name="pin" width="15" height="15" /> Ginásio da UFLA
                </span>
              </div>
            </div>
            <div className="next-game-row">
              <span className="next-game-icon">
                <Icon name="opportunity" width="17" height="17" />
              </span>
              <div>
                <small>Atividade recreativa</small>
                <strong>Treino aberto de vôlei</strong>
                <span>27 out. · Quadra coberta</span>
              </div>
            </div>
          </section>

          <section
            className="home-section opportunities-section"
            id="oportunidades"
            aria-labelledby="opportunities-title"
          >
            <div className="home-section-heading">
              <div>
                <p className="home-section-eyebrow">Seu próximo passo</p>
                <h2 id="opportunities-title">Oportunidades</h2>
              </div>
              <Link className="section-anchor-link" to="/oportunidades">
                Ver todas <Icon name="arrowUpRight" width="15" height="15" />
              </Link>
            </div>
            <div className="opportunity-preview-list">
              {opportunities.slice(0, 3).map((opportunity) => (
                <article className="opportunity-preview" key={opportunity.id}>
                  <span className="opportunity-preview-type">{opportunity.type}</span>
                  <h3>{opportunity.title}</h3>
                  <p className="opportunity-preview-owner">{opportunity.publisher}</p>
                  <p>{opportunity.description}</p>
                  <span className="opportunity-deadline">
                    <Icon name="calendar" width="14" height="14" /> {opportunity.deadline}
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="home-assistant-card" aria-labelledby="assistant-title">
            <span className="assistant-icon">
              <Icon name="message" width="19" height="19" />
            </span>
            <div>
              <p className="home-section-eyebrow">Assistente UNIR</p>
              <h2 id="assistant-title">Uma dúvida sobre a universidade?</h2>
              <p>Pergunte sobre eventos, oportunidades e recursos da UFLA.</p>
              <button type="button" className="assistant-prompt" disabled>
                O que acontece esta semana? <Icon name="arrowUpRight" width="15" height="15" />
              </button>
              <small>Prévia visual · respostas ainda não estão conectadas</small>
            </div>
          </section>
        </aside>
      </div>

      <footer className="home-footer">
        <span>
          {mockUniversity.shortName} · {mockUniversity.location}
        </span>
        <span>Uma comunidade para viver a universidade.</span>
        <Link to="/me">Meu espaço</Link>
      </footer>
    </div>
  );
}
