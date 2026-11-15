import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { SearchField } from "../components/SearchField";
import { Section } from "../components/Section";
import { addMockRegistration, events, findEntity, findEvent, type RegistrationMode } from "../data/demoContent";

const eventFilters = ["Todos", "Acadêmicos", "Esportivos"] as const;
type EventFilter = (typeof eventFilters)[number];

export function EventsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EventFilter>("Todos");
  const visibleEvents = useMemo(
    () =>
      events.filter((event) => {
        const organizer = findEntity(event.organizerId)?.name ?? "";
        const matchesQuery = `${event.title} ${event.type} ${organizer} ${event.description}`
          .toLocaleLowerCase("pt-BR")
          .includes(query.trim().toLocaleLowerCase("pt-BR"));
        return matchesQuery && (filter === "Todos" || (filter === "Esportivos") === Boolean(event.sports));
      }),
    [filter, query],
  );

  return (
    <div className="browse-page">
      <PageHeader
        eyebrow="A vida acontece junto"
        title="Eventos"
        description="Encontre atividades da universidade e saiba quem organiza, quando acontece e como participar."
      />

      <div className="page-search-toolbar" role="search" aria-label="Buscar eventos">
        <SearchField
          label="Buscar eventos"
          placeholder="Buscar por evento, tema ou entidade"
          value={query}
          onChange={setQuery}
        />
        <label className="page-filter">
          <span>Categoria</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as EventFilter)}>
            {eventFilters.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      <Section
        title="Programação"
        description={`${visibleEvents.length} eventos de exemplo`}
        action={
          <Link className="text-link" to="/esportes">
            Ver área de esportes <Icon name="arrowUpRight" width="15" height="15" />
          </Link>
        }
      >
        {visibleEvents.length ? (
          <div className="content-grid">
            {visibleEvents.map((event) => {
              const organizer = findEntity(event.organizerId)!;
              return (
                <article className="content-card event-catalog-card" key={event.id}>
                  <div className="event-catalog-card-top">
                    <div className="event-date">
                      <strong>{event.day}</strong>
                      <span>{event.month}</span>
                    </div>
                    <span className="event-kind-tag">{event.type}</span>
                  </div>
                  <h3>
                    <Link to={`/eventos/${event.id}`}>{event.title}</Link>
                  </h3>
                  <p className="event-catalog-description">{event.description}</p>
                  <div className="event-catalog-meta">
                    <span>
                      <Icon name="calendar" width="15" height="15" />
                      {event.date} · {event.time}
                    </span>
                    <span>
                      <Icon name="pin" width="15" height="15" />
                      {event.location}
                    </span>
                  </div>
                  <div className="event-catalog-organizer">
                    <span className={`entity-avatar entity-avatar-${organizer.tone}`}>{organizer.initials}</span>
                    <span>
                      Organizado por <Link to={`/entidades/${organizer.id}`}>{organizer.name}</Link>
                    </span>
                  </div>
                  <div className="event-catalog-footer">
                    <span className={event.registration === "none" ? "event-status-muted" : "event-status"}>
                      {event.status} · {event.vacancies}
                    </span>
                    <Link className="button button-secondary" to={`/eventos/${event.id}`}>
                      Ver evento
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <Icon name="search" />
            <strong>Nenhum evento encontrado</strong>
            <span>Tente outro termo ou filtro.</span>
          </div>
        )}
      </Section>
    </div>
  );
}

export function EventDetailPage() {
  const { eventId } = useParams();
  const event = findEvent(eventId);
  const [message, setMessage] = useState("");
  const organizer = event ? findEntity(event.organizerId) : undefined;

  if (!event || !organizer)
    return (
      <div className="empty-state">
        <strong>Evento não encontrado</strong>
        <Link to="/eventos">Voltar aos eventos</Link>
      </div>
    );
  const currentEvent = event;

  function register(mode: RegistrationMode) {
    const added = addMockRegistration(currentEvent.id, mode);
    setMessage(
      added ? "Inscrição adicionada à sua lista de demonstração." : "Já existe uma inscrição ativa para este evento.",
    );
  }

  return (
    <div className="detail-page event-detail-page">
      <Link className="back-link" to="/eventos">
        <Icon name="arrowLeft" width="16" height="16" /> Todos os eventos
      </Link>
      <div className="detail-layout">
        <article className="detail-main-card">
          <span className="eyebrow">
            {event.type}
            {event.sports ? ` · Esportivo · ${event.sportsLevel ?? "Todos os níveis"}` : ""}
          </span>
          <h1>{event.title}</h1>
          <p className="detail-lead">{event.description}</p>
          <div className="detail-info-grid">
            <div>
              <Icon name="calendar" />
              <span>
                <small>Quando</small>
                <strong>{event.date}</strong>
                <span>{event.time}</span>
              </span>
            </div>
            <div>
              <Icon name="pin" />
              <span>
                <small>Onde</small>
                <strong>{event.location}</strong>
              </span>
            </div>
            <div>
              <Icon name="communities" />
              <span>
                <small>Responsável</small>
                <Link to={`/entidades/${organizer.id}`}>{organizer.name}</Link>
              </span>
            </div>
            <div>
              <Icon name="check" />
              <span>
                <small>Participação</small>
                <strong>{event.status}</strong>
                <span>{event.vacancies}</span>
              </span>
            </div>
            <div>
              <Icon name="bookmark" />
              <span>
                <small>Valor</small>
                <strong>{event.price ?? "Gratuito"}</strong>
              </span>
            </div>
          </div>
          <section className="detail-copy-section">
            <h2>Sobre o evento</h2>
            <p>
              {event.description} A organização é responsável pelas informações e orientações apresentadas nesta página.
            </p>
          </section>
          {event.registration !== "none" && (
            <section className="detail-copy-section">
              <h2>Como participar</h2>
              <p>
                {event.registration === "team-or-free-agent"
                  ? "Você pode inscrever uma equipe ou se cadastrar como agente livre para encontrar um time."
                  : "Faça sua inscrição individual enquanto houver vagas."}
              </p>
              {event.registration === "team-or-free-agent" ? (
                <div className="detail-actions">
                  <button className="button button-primary" onClick={() => register("Equipe")}>
                    Inscrever equipe
                  </button>
                  <button className="button button-secondary" onClick={() => register("Agente livre")}>
                    Entrar como agente livre
                  </button>
                </div>
              ) : (
                <button className="button button-primary" onClick={() => register("Individual")}>
                  Inscrever-se
                </button>
              )}
              {message && (
                <p className="inline-confirmation" role="status">
                  {message} <Link to="/my-registrations">Ver minhas inscrições</Link>
                </p>
              )}
            </section>
          )}
        </article>
        <aside className="detail-aside-card">
          <span className="eyebrow">Quem organiza</span>
          <Link className="entity-feature-link" to={`/entidades/${organizer.id}`}>
            <span className={`entity-avatar entity-avatar-${organizer.tone}`}>{organizer.initials}</span>
            <span>
              <strong>{organizer.name}</strong>
              <small>{organizer.type}</small>
            </span>
            <Icon name="arrowUpRight" width="16" height="16" />
          </Link>
          <p>{organizer.description}</p>
          <Link className="text-link" to={`/entidades/${organizer.id}`}>
            Ver página da entidade <Icon name="arrowUpRight" width="15" height="15" />
          </Link>
        </aside>
      </div>
    </div>
  );
}
