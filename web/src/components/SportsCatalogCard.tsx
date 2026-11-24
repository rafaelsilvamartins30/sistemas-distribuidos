import { formatBrl } from "../utils/currency.js";
import { Link } from "react-router-dom";
import type { Competition, Season } from "../services/sports.js";

function statusLabel(status: string | null): string {
  if (status === "CANCELLED") return "Cancelado";
  if (status === "ARCHIVED" || status === "COMPLETED") return "Finalizado";
  if (status === "ACTIVE" || status === "IN_PROGRESS") return "Rolando";
  return "Período de Inscrição";
}

function deadline(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

function Facts({ item }: { item: Competition | Season }) {
  return (
    <dl className="sports-catalog-facts">
      <div>
        <dt>Equipes</dt>
        <dd>{item.targetTeamCount}</dd>
      </div>
      <div>
        <dt>Elenco por equipe</dt>
        <dd>
          {item.rosterMin}–{item.rosterMax} atletas
        </dd>
      </div>
      <div>
        <dt>Categoria</dt>
        <dd>Mista</dd>
      </div>
      <div>
        <dt>Inscrições até</dt>
        <dd>{deadline(item.registrationDeadline)}</dd>
      </div>
    </dl>
  );
}

export function CompetitionCard({
  competition,
  onOpen,
  actionLabel,
}: {
  competition: Competition;
  onOpen?: () => void;
  actionLabel?: string;
}) {
  return (
    <article className="sports-catalog-card" data-competition-id={competition.id}>
      <div className="sports-catalog-card-heading">
        <span className="sports-catalog-icon" aria-hidden="true">
          ⚽
        </span>
        <span className="sports-catalog-tags">
          <span className="sports-catalog-type">Campeonato · Misto</span>
          <span className="sports-catalog-level">{statusLabel(competition.status)}</span>
        </span>
      </div>
      <h3>{competition.title}</h3>
      <p className="sports-catalog-subtitle">{competition.sportName} · Fase de grupos e mata-mata</p>
      <Facts item={competition} />
      <div className="sports-catalog-price">
        <span>
          Equipe <strong>{formatBrl(competition.teamEntryPrice)}</strong>
        </span>
        <span>
          Free agent <strong>{formatBrl(competition.freeAgentPrice)}</strong>
        </span>
      </div>
      {onOpen ? (
        <button type="button" className="button button-primary" onClick={onOpen}>
          {actionLabel ?? "Abrir campeonato"}
        </button>
      ) : (
        <Link className="button button-primary" to={`/esportes/campeonatos/${competition.id}`}>
          {actionLabel ?? "Ver campeonato"}
        </Link>
      )}
    </article>
  );
}

export function SeasonCard({
  season,
  onOpen,
  actionLabel,
}: {
  season: Season;
  onOpen?: () => void;
  actionLabel?: string;
}) {
  const roundLabel = season.roundRobinMode === "double round-robin" ? "Turno e returno" : "Turno único";
  return (
    <article className="sports-catalog-card" data-season-id={season.id}>
      <div className="sports-catalog-card-heading">
        <span className="sports-catalog-icon sports-catalog-icon-season" aria-hidden="true">
          🏐
        </span>
        <span className="sports-catalog-tags">
          <span className="sports-catalog-type">Temporada · Misto</span>
          <span className="sports-catalog-level">{statusLabel(season.status)}</span>
        </span>
      </div>
      <h3>{season.title}</h3>
      <p className="sports-catalog-subtitle">
        {season.sportName} · Pontos corridos · {roundLabel}
      </p>
      <Facts item={season} />
      <div className="sports-catalog-price">
        <span>
          Equipe <strong>{formatBrl(season.teamEntryPrice)}</strong>
        </span>
        <span>
          Free agent <strong>{formatBrl(season.freeAgentPrice)}</strong>
        </span>
      </div>
      {onOpen ? (
        <button type="button" className="button button-primary" onClick={onOpen}>
          {actionLabel ?? "Abrir temporada"}
        </button>
      ) : (
        <Link className="button button-primary" to={`/esportes/temporadas/${season.id}`}>
          {actionLabel ?? "Ver temporada"}
        </Link>
      )}
    </article>
  );
}
