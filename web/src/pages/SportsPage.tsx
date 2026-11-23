import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { SearchField } from "../components/SearchField";
import { CompetitionCard, SeasonCard } from "../components/SportsCatalogCard";
import { SportsCreateModal } from "../components/SportsCreateModal";
import {
  getCompetitions,
  getMySportsEnrollments,
  getSeasons,
  getSports,
  getSportsOrganizerContexts,
  type Competition,
  type MySportsEnrollment,
  type Page,
  type Season,
  type Sport,
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
  const [myEnrollments, setMyEnrollments] = useState<MySportsEnrollment[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
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
        const [sports, competitions, seasons, contexts, enrollments] = await Promise.all([
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
          getMySportsEnrollments(keycloak.token).catch(() => ({ items: [] })),
        ]);
        if (active) {
          setCatalog({ sports, competitions, seasons });
          setOrganizerContexts(contexts.items.filter((ctx) => ctx.organizerType === "UNIVERSITY"));
          setMyEnrollments(enrollments.items);
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
            <span aria-hidden="true">●</span>{" "}
            {canCreate ? "Painel da Universidade · gestão esportiva" : "Campus integrado · esporte universitário"}
          </p>
          <h1>{canCreate ? "Gestão de Campeonatos da Universidade" : "Esportes & Ligas Universitárias"}</h1>
          <p>
            {canCreate
              ? "Crie e gerencie as Copas de Mata-Mata (32 times obrigatórios, finais de semana) e Temporadas de Pontos Corridos (10 times obrigatórios, terças e quintas). Abra qualquer campeonato para acompanhar inscrições, lançar placares e liberar códigos de presença."
              : "Explore os campeonatos de mata-mata (finais de semana) e as temporadas de pontos corridos (terças e quintas) organizados pela Universidade. Abra qualquer campeonato para ver a situação atual, tabela, calendário de partidas e equipes."}
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
          {!canCreate && (
            <Link className="button button-secondary" to="/meus-esportes">
              Meus Campeonatos ({myEnrollments.length}) →
            </Link>
          )}
          {canCreate && (
            <button type="button" className="button button-primary" onClick={() => setCreateOpen(true)}>
              + Criar Campeonato
            </button>
          )}
        </div>
      </header>

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
            <option value="COMPETITION">Campeonatos (Mata-mata)</option>
            <option value="SEASON">Temporadas (Pontos corridos)</option>
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
              <p className="sports-kicker">Calendário oficial da Universidade</p>
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
                  actionLabel={canCreate ? "Gerenciar campeonato" : undefined}
                />
              ))}
              {visibleSeasons.map((season) => (
                <SeasonCard
                  key={`season-${season.id}`}
                  season={season}
                  actionLabel={canCreate ? "Gerenciar temporada" : undefined}
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
