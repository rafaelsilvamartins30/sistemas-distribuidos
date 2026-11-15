import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { events, findEntity, sports } from "../data/demoContent";

const levels = ["Todos", "Recreativo", "Competitivo", "Todos os níveis"] as const;

export function SportsPage() {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<(typeof levels)[number]>("Todos");
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [profileRequested, setProfileRequested] = useState(false);

  const visibleSports = useMemo(
    () =>
      sports.filter((item) => {
        const organizer = findEntity(item.organizerId)?.name ?? "";
        const event = events.find((candidate) => candidate.id === item.eventId);
        const matchesQuery =
          `${item.sport} ${item.level} ${item.format} ${item.description} ${organizer} ${event?.title ?? ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(query.trim().toLocaleLowerCase("pt-BR"));
        return matchesQuery && (level === "Todos" || item.level === level);
      }),
    [level, query],
  );

  function register(id: string, kind: "equipe" | "agente livre" | "participante") {
    setMessages((current) => ({ ...current, [id]: `Interesse como ${kind} registrado nesta demonstração.` }));
  }

  return (
    <div className="catalog-page sports-page">
      <div className="page-heading-row">
        <div className="page-intro product-page-intro">
          <p className="eyebrow">Encontre seu próximo jogo</p>
          <h1>Esportes</h1>
          <p>Busque campeonatos, temporadas e atividades abertas na comunidade universitária.</p>
        </div>
        <span className="preview-badge">
          <span aria-hidden="true" /> Prévia visual
        </span>
      </div>

      <section className="sports-join-banner">
        <div>
          <span className="eyebrow">Quer participar?</span>
          <h2>Peça seu cadastro na área esportiva</h2>
          <p>A solicitação demonstra como você pediria acesso para acompanhar atividades e inscrições.</p>
        </div>
        <button className="button button-primary" disabled={profileRequested} onClick={() => setProfileRequested(true)}>
          {profileRequested ? "Solicitação enviada" : "Solicitar cadastro"}
        </button>
      </section>
      {profileRequested && (
        <p className="inline-confirmation" role="status">
          Solicitação de cadastro registrada nesta demonstração.
        </p>
      )}

      <section className="catalog-tools" aria-label="Buscar atividades esportivas">
        <label className="search-field">
          <Icon name="search" width="18" height="18" />
          <span className="sr-only">Buscar esporte ou evento</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar esporte, campeonato ou entidade"
          />
        </label>
        <label className="select-filter">
          <span>Nível</span>
          <select value={level} onChange={(event) => setLevel(event.target.value as (typeof levels)[number])}>
            {levels.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </section>

      <div className="catalog-results-heading">
        <div>
          <h2>Atividades esportivas</h2>
          <p>{visibleSports.length} opções de exemplo</p>
        </div>
        <Link className="text-link" to="/eventos">
          Ver todos os eventos <Icon name="arrowUpRight" width="15" height="15" />
        </Link>
      </div>
      {visibleSports.length ? (
        <div className="sports-listing-grid">
          {visibleSports.map((item) => {
            const event = events.find((candidate) => candidate.id === item.eventId)!;
            const organizer = findEntity(item.organizerId)!;
            return (
              <article className="sports-listing-card" key={item.id}>
                <div className="sports-card-top">
                  <span className="sports-icon">
                    <Icon name="opportunity" width="20" height="20" />
                  </span>
                  <div>
                    <span className="event-kind-tag">{item.format}</span>
                    <span className="sports-level-tag">{item.level}</span>
                  </div>
                </div>
                <p className="sports-card-category">{item.sport}</p>
                <h3>{event.title}</h3>
                <p className="sports-card-description">{item.description}</p>
                <dl className="sports-card-facts">
                  <div>
                    <dt>Data</dt>
                    <dd>{event.date}</dd>
                  </div>
                  <div>
                    <dt>Vagas</dt>
                    <dd>{item.vacancies}</dd>
                  </div>
                  <div>
                    <dt>Local</dt>
                    <dd>{event.location}</dd>
                  </div>
                </dl>
                <div className="sports-organizer">
                  <span className={`entity-avatar entity-avatar-${organizer.tone}`}>{organizer.initials}</span>
                  <span>
                    Organização responsável <Link to={`/entidades/${organizer.id}`}>{organizer.name}</Link>
                  </span>
                </div>
                <div className="sports-card-actions">
                  <Link className="text-link" to={`/eventos/${event.id}`}>
                    Detalhes do evento <Icon name="arrowUpRight" width="15" height="15" />
                  </Link>
                  {item.kind === "team-or-free-agent" ? (
                    <div className="detail-actions">
                      <button className="button button-primary" onClick={() => register(item.id, "equipe")}>
                        Inscrever equipe
                      </button>
                      <button className="button button-secondary" onClick={() => register(item.id, "agente livre")}>
                        Agente livre
                      </button>
                    </div>
                  ) : (
                    <button className="button button-primary" onClick={() => register(item.id, "participante")}>
                      Inscrever-se
                    </button>
                  )}
                  {messages[item.id] && (
                    <p className="inline-confirmation" role="status">
                      {messages[item.id]}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <Icon name="search" />
          <strong>Nenhuma atividade encontrada</strong>
          <span>Experimente outro esporte ou nível.</span>
        </div>
      )}
      <p className="opportunity-footnote">
        <Icon name="check" width="15" height="15" /> As inscrições desta prévia não são enviadas a uma organização.
      </p>
    </div>
  );
}
