import { Link } from "react-router-dom";
import type { Competition, Season } from "../services/sports.js";

function currency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function levelLabel(value: string): string {
  const labels: Record<string, string> = {
    COMPETITIVE: "Competitivo",
    RECREATIONAL: "Recreativo",
  };
  return labels[value] ?? value;
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
        <dt>Nível</dt>
        <dd>{levelLabel(item.skillLevel)}</dd>
      </div>
      <div>
        <dt>Inscrições até</dt>
        <dd>{deadline(item.registrationDeadline)}</dd>
      </div>
    </dl>
  );
}

export function CompetitionCard({ competition }: { competition: Competition }) {
  return (
    <article className="sports-catalog-card" data-competition-id={competition.id}>
      <div className="sports-catalog-card-heading">
        <span className="sports-catalog-icon" aria-hidden="true">
          ⚽
        </span>
        <span className="sports-catalog-tags">
          <span className="sports-catalog-type">Campeonato</span>
          <span className="sports-catalog-level">{levelLabel(competition.skillLevel)}</span>
        </span>
      </div>
      <h3>{competition.title}</h3>
      <p className="sports-catalog-subtitle">{competition.sportName} · Fase de grupos e mata-mata</p>
      <Facts item={competition} />
      <div className="sports-catalog-price">
        <span>
          Equipe <strong>{currency(competition.teamEntryPrice)}</strong>
        </span>
        <span>
          Free agent <strong>{currency(competition.freeAgentPrice)}</strong>
        </span>
      </div>
      <Link className="button button-primary" to={`/esportes/campeonatos/${competition.id}`}>
        Ver campeonato
      </Link>
    </article>
  );
}

export function SeasonCard({ season }: { season: Season }) {
  const roundLabel = season.roundRobinMode === "double round-robin" ? "Turno e returno" : "Turno único";
  return (
    <article className="sports-catalog-card" data-season-id={season.id}>
      <div className="sports-catalog-card-heading">
        <span className="sports-catalog-icon sports-catalog-icon-season" aria-hidden="true">
          🏐
        </span>
        <span className="sports-catalog-tags">
          <span className="sports-catalog-type">Temporada</span>
          <span className="sports-catalog-level">{levelLabel(season.skillLevel)}</span>
        </span>
      </div>
      <h3>{season.title}</h3>
      <p className="sports-catalog-subtitle">
        {season.sportName} · Pontos corridos · {roundLabel}
      </p>
      <Facts item={season} />
      <div className="sports-catalog-price">
        <span>
          Equipe <strong>{currency(season.teamEntryPrice)}</strong>
        </span>
        <span>
          Free agent <strong>{currency(season.freeAgentPrice)}</strong>
        </span>
      </div>
      <Link className="button button-primary" to={`/esportes/temporadas/${season.id}`}>
        Ver temporada
      </Link>
    </article>
  );
}
