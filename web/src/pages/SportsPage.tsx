import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { SearchField } from "../components/SearchField";
import { CompetitionCard, SeasonCard } from "../components/SportsCatalogCard";
import { useToast } from "../contexts/ToastContext";
import {
  getCompetitions,
  getMySportsEnrollments,
  getSeasons,
  getSports,
  type Competition,
  type MySportsEnrollment,
  type Page,
  type Season,
  type Sport,
} from "../services/sports.js";
import { extractErrorMessage } from "../utils/apiError.js";

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
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [catalog, setCatalog] = useState<CatalogState>({
    sports: EMPTY_PAGE,
    competitions: EMPTY_PAGE,
    seasons: EMPTY_PAGE,
  });
  const [myEnrollments, setMyEnrollments] = useState<MySportsEnrollment[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadCatalog() {
      setCatalogLoading(true);
      setCatalogError(false);
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const [sports, competitions, seasons, enrollments] = await Promise.all([
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
          getMySportsEnrollments(keycloak.token).catch(() => ({ items: [] })),
        ]);
        if (active) {
          setCatalog({ sports, competitions, seasons });
          setMyEnrollments(enrollments.items);
        }
      } catch (err) {
        if (active) {
          setCatalogError(true);
          toast.error(extractErrorMessage(err, "Não foi possível carregar o catálogo esportivo."));
        }
      } finally {
        if (active) setCatalogLoading(false);
      }
    }
    void loadCatalog();
    return () => {
      active = false;
    };
  }, [keycloak, query, sportFilter, toast]);

  const visibleCompetitions = typeFilter === "SEASON" ? [] : catalog.competitions.items;
  const visibleSeasons = typeFilter === "COMPETITION" ? [] : catalog.seasons.items;
  const totalVisible = visibleCompetitions.length + visibleSeasons.length;
  return (
    <div className="browse-page capability-page sports-page">
      <header className="sports-hero">
        <div className="sports-hero-copy">
          <p className="sports-kicker">
            <span aria-hidden="true">●</span> "Campus integrado · esporte universitário"
          </p>
          <h1>Esportes &amp; Ligas Universitárias</h1>
          <p>
            Explore os campeonatos de mata-mata e as temporadas de pontos corridos organizados pela Universidade. Abra
            qualquer campeonato para ver a situação atual, tabela, calendário de partidas e equipes.
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
          <Link className="button button-secondary" to="/meus-esportes">
            Meus Campeonatos ({myEnrollments.length}) →
          </Link>
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
                <CompetitionCard key={`comp-${competition.id}`} competition={competition} />
              ))}
              {visibleSeasons.map((season) => (
                <SeasonCard key={`season-${season.id}`} season={season} />
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
    </div>
  );
}
