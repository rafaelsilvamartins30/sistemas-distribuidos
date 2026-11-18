import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { getCompetition, getSeason, getSport, type Competition, type Season, type Sport } from "../services/sports.js";

interface WebContext {
  keycloak: Keycloak;
}

type Detail =
  | { kind: "sport"; item: Sport; sport: Sport }
  | { kind: "competition"; item: Competition; sport: Sport }
  | { kind: "season"; item: Season; sport: Sport };

type CompetitionOrSeason = Extract<Detail, { kind: "competition" | "season" }>;

function formatPrice(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function CompetitionOrSeasonFacts({ detail }: { detail: CompetitionOrSeason }) {
  const item = detail.item;
  return (
    <>
      <dl className="sports-detail-facts">
        <div>
          <dt>Equipes</dt>
          <dd>{item.targetTeamCount}</dd>
        </div>
        <div>
          <dt>Elenco por equipe</dt>
          <dd>
            {item.rosterMin}–{item.rosterMax}
          </dd>
        </div>
        <div>
          <dt>Taxa por equipe</dt>
          <dd>{formatPrice(item.teamEntryPrice)}</dd>
        </div>
        <div>
          <dt>Inscrição individual</dt>
          <dd>{formatPrice(item.freeAgentPrice)}</dd>
        </div>
        <div>
          <dt>Prazo de inscrição</dt>
          <dd>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(item.registrationDeadline))}</dd>
        </div>
        {detail.kind === "competition" ? (
          <div>
            <dt>Formato</dt>
            <dd>Fase de grupos e mata-mata · {detail.item.format}</dd>
          </div>
        ) : (
          <div>
            <dt>Turno</dt>
            <dd>{detail.item.roundRobinMode === "double round-robin" ? "Turno e returno" : "Turno único"}</dd>
          </div>
        )}
        <div>
          <dt>Desempates</dt>
          <dd>{item.tieBreakers.length ? item.tieBreakers.join(" · ") : "Pontos; desempates não configurados"}</dd>
        </div>
      </dl>
      <p className="sports-detail-note">
        Esta tela é informativa. Inscrições, equipes e partidas ainda não estão disponíveis neste fluxo.
      </p>
    </>
  );
}

export function SportsDetailPage({ kind }: { kind: Detail["kind"] }) {
  const { keycloak } = useOutletContext<WebContext>();
  const params = useParams();
  const id = params.sportId ?? params.competitionId ?? params.seasonId ?? "";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token || !id) throw new Error("Token or identifier unavailable");
        if (kind === "sport") {
          const sport = await getSport(keycloak.token, id);
          if (active) setDetail({ kind, item: sport, sport });
        } else if (kind === "competition") {
          const competition = await getCompetition(keycloak.token, id);
          const sport = await getSport(keycloak.token, competition.sportId);
          if (active) setDetail({ kind, item: competition, sport });
        } else {
          const season = await getSeason(keycloak.token, id);
          const sport = await getSport(keycloak.token, season.sportId);
          if (active) setDetail({ kind, item: season, sport });
        }
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id, keycloak, kind]);

  if (loading)
    return (
      <p className="notice" role="status">
        Carregando detalhes esportivos…
      </p>
    );
  if (error || !detail) {
    return (
      <section className="capability-empty capability-empty-compact" role="alert">
        <h1>Não foi possível carregar este registro</h1>
        <p>O item pode ter sido removido ou a consulta está temporariamente indisponível.</p>
        <Link className="button button-secondary" to="/esportes">
          Voltar ao catálogo
        </Link>
      </section>
    );
  }

  const title = detail.kind === "sport" ? detail.item.name : detail.item.title;
  return (
    <main className="sports-detail-page">
      <Link className="back-link" to="/esportes">
        ← Voltar aos esportes
      </Link>
      <section className="sports-detail-hero">
        <p className="sports-kicker">
          {detail.kind === "sport" ? "Modalidade" : detail.kind === "competition" ? "Campeonato" : "Temporada"}
        </p>
        <h1>{title}</h1>
        {detail.kind !== "sport" && (
          <p>
            {detail.sport.name} · {detail.item.skillLevel}
          </p>
        )}
      </section>

      <section className="sports-detail-panel" aria-labelledby="sports-detail-information">
        <div className="sports-section-heading">
          <div>
            <p className="sports-kicker">Informações cadastradas</p>
            <h2 id="sports-detail-information">
              {detail.kind === "sport" ? "Regras da modalidade" : "Formato e inscrição"}
            </h2>
          </div>
          {detail.item.status && <span className="sports-catalog-type">{detail.item.status}</span>}
        </div>
        {detail.kind === "sport" ? (
          <>
            <dl className="sports-detail-facts">
              <div>
                <dt>Atletas em quadra</dt>
                <dd>{detail.item.playersOnField}</dd>
              </div>
              <div>
                <dt>Elenco permitido</dt>
                <dd>
                  {detail.item.minimumRoster}–{detail.item.maximumRoster}
                </dd>
              </div>
              <div>
                <dt>Empate permitido</dt>
                <dd>{detail.item.allowsDraw ? "Sim" : "Não"}</dd>
              </div>
              <div>
                <dt>Pontuação</dt>
                <dd>
                  Vitória {detail.item.winPoints} · empate {detail.item.drawPoints} · derrota {detail.item.lossPoints}
                </dd>
              </div>
              <div>
                <dt>Placar padrão de W.O.</dt>
                <dd>{detail.item.defaultForfeitScore}</dd>
              </div>
            </dl>
            <div className="sports-rules-copy">
              <h3>Regulamento</h3>
              <p>{detail.item.rulesMarkdown}</p>
            </div>
          </>
        ) : (
          <CompetitionOrSeasonFacts detail={detail} />
        )}
      </section>
    </main>
  );
}
