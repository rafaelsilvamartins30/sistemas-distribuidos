import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { SearchField } from "../components/SearchField";
import { CompetitionCard, SeasonCard } from "../components/SportsCatalogCard";
import { SportsCreateModal } from "../components/SportsCreateModal";
import { SportsEventModal } from "../components/SportsEventModal";
import {
  getCompetitions,
  getMySportsMatches,
  getSeasons,
  getSports,
  getSportsOrganizerContexts,
  type Competition,
  type MySportsMatch,
  type Page,
  type Season,
  type Sport,
  type SportsContextType,
  type SportsOrganizerContext,
} from "../services/sports.js";

interface WebContext {
  keycloak: Keycloak;
}

interface CatalogState {
  sports: Page<Sport>;
  competitions: Page<Competition>;
  seasons: Page<Season>;
}

type TypeFilter = "ALL" | "COMPETITION" | "SEASON";

const EMPTY_PAGE = { items: [], page: 0, size: 50, totalElements: 0, totalPages: 0 };

function formatMatchDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function SportsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [query, setQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [catalog, setCatalog] = useState<CatalogState>({
    sports: EMPTY_PAGE,
    competitions: EMPTY_PAGE,
    seasons: EMPTY_PAGE,
  });
  const [organizerContexts, setOrganizerContexts] = useState<SportsOrganizerContext[]>([]);
  const [myMatches, setMyMatches] = useState<MySportsMatch[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState<{
    contextType: SportsContextType;
    contextId: string;
    initialTab?: "overview" | "teams" | "matches";
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refreshAll = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError(false);
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const [sports, competitions, seasons, contexts, matches] = await Promise.all([
          getSports(keycloak.token, { size: 100 }),
          getCompetitions(keycloak.token, {
            q: query,
            sportId: sportFilter || undefined,
            size: 50,
          }),
          getSeasons(keycloak.token, {
            q: query,
            sportId: sportFilter || undefined,
            size: 50,
          }),
          getSportsOrganizerContexts(keycloak.token).catch(() => ({ items: [] })),
          getMySportsMatches(keycloak.token).catch(() => ({ items: [] })),
        ]);
        if (active) {
          setCatalog({ sports, competitions, seasons });
          setOrganizerContexts(contexts.items);
          setMyMatches(matches.items);
        }
      } catch {
        if (active) setCatalogError(true);
      } finally {
        if (active) setCatalogLoading(false);
      }
    }
    void loadCatalog();
    return () => {
      active = false;
    };
  }, [keycloak, query, reloadKey, sportFilter]);

  const visibleCompetitions = typeFilter === "SEASON" ? [] : catalog.competitions.items;
  const visibleSeasons = typeFilter === "COMPETITION" ? [] : catalog.seasons.items;
  const totalVisible = visibleCompetitions.length + visibleSeasons.length;
  const canCreate = organizerContexts.length > 0;

  return (
    <div className="browse-page capability-page sports-page">
      <header className="sports-hero">
        <div className="sports-hero-copy">
          <p className="sports-kicker">
            <span aria-hidden="true">●</span> Campus integrado · esporte universitário
          </p>
          <h1>Esportes &amp; Ligas Universitárias</h1>
          <p>
            Explore campeonatos e temporadas da UFLA. Clique em qualquer card para ver regras da modalidade, inscrever
            sua equipe ou entrar como free agent e acompanhar suas partidas.
          </p>
        </div>
        <div className="sports-hero-actions">
          <div
            className="sports-hero-count"
            aria-label={`${catalog.competitions.totalElements + catalog.seasons.totalElements} competições e temporadas`}
          >
            <strong>{catalog.competitions.totalElements + catalog.seasons.totalElements}</strong>
            <span>Competições e temporadas</span>
          </div>
          {canCreate && (
            <button type="button" className="button button-primary" onClick={() => setCreateOpen(true)}>
              + Criar
            </button>
          )}
        </div>
      </header>

      {myMatches.length > 0 && (
        <section className="sports-my-matches" aria-labelledby="sports-my-matches-title">
          <div className="sports-section-heading">
            <div>
              <p className="sports-kicker">Meus campeonatos</p>
              <h2 id="sports-my-matches-title">Próximas partidas</h2>
            </div>
            <span className="sports-count">{myMatches.length} partida(s)</span>
          </div>
          <div className="sports-my-matches-grid">
            {myMatches.map((match) => (
              <article key={match.matchId} className="sports-my-match-card">
                <div className="sports-match-head">
                  <span className="sports-catalog-type">{match.sportName}</span>
                  <span className="sports-match-meta">{formatMatchDate(match.scheduledAt)}</span>
                </div>
                <h3>{match.eventTitle}</h3>
                <p className="sports-my-match-versus">
                  <strong>{match.teamName}</strong> vs <strong>{match.opponentName}</strong>
                </p>
                <p className="sports-match-meta">
                  {match.location} ·{" "}
                  {match.status === "COMPLETED"
                    ? `Placar: ${match.homeScore} × ${match.awayScore}`
                    : match.viewerCheckedIn
                      ? "Presença confirmada ✓"
                      : match.hasCheckinToken
                        ? "Check-in aberto!"
                        : "Agendada"}
                </p>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() =>
                    setSelectedEvent({
                      contextType: match.contextType,
                      contextId: match.contextId,
                      initialTab: "matches",
                    })
                  }
                >
                  {match.hasCheckinToken && !match.viewerCheckedIn ? "Confirmar presença" : "Ver partida"}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="sports-search-panel" aria-label="Filtrar campeonatos e temporadas">
        <SearchField
          label="Buscar campeonatos e temporadas"
          placeholder="Buscar por título ou modalidade…"
          value={query}
          onChange={setQuery}
        />
        <label className="sports-filter">
          <span>Esporte</span>
          <select value={sportFilter} onChange={(event) => setSportFilter(event.target.value)}>
            <option value="">Todos</option>
            {catalog.sports.items.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.name}
              </option>
            ))}
          </select>
        </label>
        <label className="sports-filter">
          <span>Tipo</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}>
            <option value="ALL">Todos</option>
            <option value="COMPETITION">Campeonatos</option>
            <option value="SEASON">Temporadas</option>
          </select>
        </label>
      </section>

      {catalogLoading && (
        <p className="notice" role="status">
          Carregando campeonatos e temporadas…
        </p>
      )}
      {catalogError && (
        <p className="notice notice-error" role="alert">
          Não foi possível carregar o catálogo esportivo. Tente novamente mais tarde.
        </p>
      )}

      {!catalogLoading && !catalogError && (
        <section className="sports-section" aria-labelledby="sports-unified-title">
          <div className="sports-section-heading">
            <div>
              <p className="sports-kicker">Inscrições abertas e histórico</p>
              <h2 id="sports-unified-title">Campeonatos &amp; Temporadas</h2>
            </div>
            <span className="sports-count">{totalVisible} exibido(s)</span>
          </div>

          {totalVisible > 0 ? (
            <div className="sports-catalog-grid">
              {visibleCompetitions.map((competition) => (
                <CompetitionCard
                  key={`comp-${competition.id}`}
                  competition={competition}
                  onOpen={() =>
                    setSelectedEvent({ contextType: "COMPETITION", contextId: competition.id, initialTab: "overview" })
                  }
                />
              ))}
              {visibleSeasons.map((season) => (
                <SeasonCard
                  key={`season-${season.id}`}
                  season={season}
                  onOpen={() =>
                    setSelectedEvent({ contextType: "SEASON", contextId: season.id, initialTab: "overview" })
                  }
                />
              ))}
            </div>
          ) : (
            <p className="sports-empty">
              {query || sportFilter || typeFilter !== "ALL"
                ? "Nenhum campeonato ou temporada corresponde aos filtros selecionados."
                : "Nenhum campeonato ou temporada cadastrado."}
            </p>
          )}
        </section>
      )}

      {selectedEvent && (
        <SportsEventModal
          keycloak={keycloak}
          contextType={selectedEvent.contextType}
          contextId={selectedEvent.contextId}
          initialTab={selectedEvent.initialTab}
          onClose={() => setSelectedEvent(null)}
          onChanged={refreshAll}
        />
      )}

      {createOpen && (
        <SportsCreateModal
          keycloak={keycloak}
          sports={catalog.sports.items}
          organizerContexts={organizerContexts}
          onClose={() => setCreateOpen(false)}
          onCreated={refreshAll}
        />
      )}
    </div>
  );
}
