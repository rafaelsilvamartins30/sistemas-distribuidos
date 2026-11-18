import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { EventCard } from "../components/EventCard";
import { Icon } from "../components/Icon";
import { PaginationControls } from "../components/PaginationControls";
import { SearchField } from "../components/SearchField";
import { CompetitionCard, SeasonCard } from "../components/SportsCatalogCard";
import { useEventList } from "../hooks/useEventList";
import {
  getCompetitions,
  getSeasons,
  getSports,
  type Competition,
  type Page,
  type Season,
  type Sport,
} from "../services/sports.js";

interface WebContext {
  keycloak: Keycloak;
}

interface CatalogState {
  sports: Page<Sport>;
  competitions: Page<Competition>;
  seasons: Page<Season>;
}

const PAGE_SIZE = 6;
const EMPTY_PAGE = { items: [], page: 0, size: PAGE_SIZE, totalElements: 0, totalPages: 0 };

function isSportsCategory(category: string): boolean {
  const normalized = category
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /sport|futebol|futsal|volei|voleibol|basquete|handebol/.test(normalized);
}

function ModalityCard({ sport }: { sport: Sport }) {
  return (
    <article className="sports-modality-card" data-sport-id={sport.id}>
      <span className="sports-modality-mark" aria-hidden="true">
        ✦
      </span>
      <div>
        <p className="sports-kicker">Modalidade</p>
        <h3>{sport.name}</h3>
        <p>
          {sport.playersOnField} em quadra · elenco de {sport.minimumRoster} a {sport.maximumRoster}
        </p>
      </div>
      <Link className="text-link" to={`/esportes/modalidades/${sport.id}`}>
        Regras da modalidade <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export function SportsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { events, loading: eventsLoading, error: eventsError } = useEventList(keycloak);
  const [query, setQuery] = useState("");
  const [sportFilter, setSportFilter] = useState("");
  const [competitionSize, setCompetitionSize] = useState("");
  const [seasonSize, setSeasonSize] = useState("");
  const [competitionPage, setCompetitionPage] = useState(0);
  const [seasonPage, setSeasonPage] = useState(0);
  const [catalog, setCatalog] = useState<CatalogState>({
    sports: EMPTY_PAGE,
    competitions: EMPTY_PAGE,
    seasons: EMPTY_PAGE,
  });
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
        const [sports, competitions, seasons] = await Promise.all([
          getSports(keycloak.token, { q: query, size: 100 }),
          getCompetitions(keycloak.token, {
            q: query,
            sportId: sportFilter || undefined,
            targetTeamCount: competitionSize ? Number(competitionSize) : undefined,
            page: competitionPage,
            size: PAGE_SIZE,
          }),
          getSeasons(keycloak.token, {
            q: query,
            sportId: sportFilter || undefined,
            targetTeamCount: seasonSize ? Number(seasonSize) : undefined,
            page: seasonPage,
            size: PAGE_SIZE,
          }),
        ]);
        if (active) setCatalog({ sports, competitions, seasons });
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
  }, [competitionPage, competitionSize, keycloak, query, seasonPage, seasonSize, sportFilter]);

  const sportsEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return events.filter((event) => {
      if (!isSportsCategory(`${event.category} ${event.title} ${event.description} ${event.location}`)) return false;
      return `${event.title} ${event.category} ${event.description} ${event.location}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedQuery);
    });
  }, [events, query]);

  function changeQuery(value: string) {
    setQuery(value);
    setCompetitionPage(0);
    setSeasonPage(0);
  }

  function changeSport(value: string) {
    setSportFilter(value);
    setCompetitionPage(0);
    setSeasonPage(0);
  }

  return (
    <div className="browse-page capability-page sports-page">
      <header className="sports-hero">
        <div className="sports-hero-copy">
          <p className="sports-kicker">
            <span aria-hidden="true">●</span> Campus integrado · esporte universitário
          </p>
          <h1>Esportes &amp; Ligas Universitárias</h1>
          <p>
            Encontre competições e temporadas cadastradas pela comunidade universitária. Consulte os formatos,
            regulamentos e prazos diretamente no catálogo.
          </p>
        </div>
        <div
          className="sports-hero-count"
          aria-label={`${catalog.competitions.totalElements + catalog.seasons.totalElements} competições e temporadas`}
        >
          <strong>{catalog.competitions.totalElements + catalog.seasons.totalElements}</strong>
          <span>Competições e temporadas</span>
        </div>
      </header>

      <section className="sports-policy-panel" aria-label="Formatos disponíveis">
        <article>
          <span className="sports-policy-icon">
            <Icon name="calendar" />
          </span>
          <div>
            <strong>Campeonatos</strong>
            <p>16 ou 32 equipes · grupos e mata-mata.</p>
          </div>
        </article>
        <article>
          <span className="sports-policy-icon">
            <Icon name="communities" />
          </span>
          <div>
            <strong>Temporadas</strong>
            <p>10 equipes em turno e returno; 20 em turno único.</p>
          </div>
        </article>
        <article>
          <span className="sports-policy-icon">
            <Icon name="shield" />
          </span>
          <div>
            <strong>Regras da modalidade</strong>
            <p>Elencos e pontuação ficam no cadastro do esporte.</p>
          </div>
        </article>
      </section>

      <section className="sports-search-panel" aria-label="Buscar no catálogo esportivo">
        <SearchField
          label="Buscar no catálogo esportivo"
          placeholder="Buscar por campeonato, temporada ou modalidade…"
          value={query}
          onChange={changeQuery}
        />
        <label className="sports-filter">
          <span>Modalidade</span>
          <select value={sportFilter} onChange={(event) => changeSport(event.target.value)}>
            <option value="">Todas</option>
            {catalog.sports.items.map((sport) => (
              <option key={sport.id} value={sport.id}>
                {sport.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {catalogLoading && (
        <p className="notice" role="status">
          Carregando modalidades, campeonatos e temporadas…
        </p>
      )}
      {catalogError && (
        <p className="notice notice-error" role="alert">
          Não foi possível carregar o catálogo esportivo. Tente novamente mais tarde.
        </p>
      )}

      {!catalogLoading && !catalogError && (
        <>
          <section className="sports-section" aria-labelledby="sports-modalities-title">
            <div className="sports-section-heading">
              <div>
                <p className="sports-kicker">Regras concentradas por modalidade</p>
                <h2 id="sports-modalities-title">Modalidades cadastradas</h2>
              </div>
              <span className="sports-count">{catalog.sports.totalElements} no catálogo</span>
            </div>
            {catalog.sports.items.length ? (
              <div className="sports-modality-grid">
                {catalog.sports.items.map((sport) => (
                  <ModalityCard key={sport.id} sport={sport} />
                ))}
              </div>
            ) : (
              <p className="sports-empty">Nenhuma modalidade corresponde à busca.</p>
            )}
          </section>

          <section className="sports-section" aria-labelledby="sports-competitions-title">
            <div className="sports-section-heading">
              <div>
                <p className="sports-kicker">16 ou 32 equipes · GROUPS_KNOCKOUT</p>
                <h2 id="sports-competitions-title">Campeonatos</h2>
              </div>
              <label className="sports-inline-filter">
                <span>Equipes</span>
                <select
                  value={competitionSize}
                  onChange={(event) => {
                    setCompetitionSize(event.target.value);
                    setCompetitionPage(0);
                  }}
                >
                  <option value="">Todos</option>
                  <option value="16">16</option>
                  <option value="32">32</option>
                </select>
              </label>
            </div>
            {catalog.competitions.items.length ? (
              <div className="sports-catalog-grid">
                {catalog.competitions.items.map((competition) => (
                  <CompetitionCard key={competition.id} competition={competition} />
                ))}
              </div>
            ) : (
              <p className="sports-empty">
                {query ? "Nenhum campeonato encontrado." : "Nenhum campeonato cadastrado."}
              </p>
            )}
            <PaginationControls
              page={catalog.competitions.page}
              totalPages={catalog.competitions.totalPages}
              onPageChange={setCompetitionPage}
            />
          </section>

          <section className="sports-section" aria-labelledby="sports-seasons-title">
            <div className="sports-section-heading">
              <div>
                <p className="sports-kicker">Pontos corridos · turno configurado pelo tamanho</p>
                <h2 id="sports-seasons-title">Temporadas</h2>
              </div>
              <label className="sports-inline-filter">
                <span>Equipes</span>
                <select
                  value={seasonSize}
                  onChange={(event) => {
                    setSeasonSize(event.target.value);
                    setSeasonPage(0);
                  }}
                >
                  <option value="">Todas</option>
                  <option value="10">10</option>
                  <option value="20">20</option>
                </select>
              </label>
            </div>
            {catalog.seasons.items.length ? (
              <div className="sports-catalog-grid">
                {catalog.seasons.items.map((season) => (
                  <SeasonCard key={season.id} season={season} />
                ))}
              </div>
            ) : (
              <p className="sports-empty">
                {query ? "Nenhuma temporada encontrada." : "Nenhuma temporada cadastrada."}
              </p>
            )}
            <PaginationControls
              page={catalog.seasons.page}
              totalPages={catalog.seasons.totalPages}
              onPageChange={setSeasonPage}
            />
          </section>
        </>
      )}

      <section className="sports-section sports-event-section" aria-labelledby="sports-events-title">
        <div className="sports-section-heading">
          <div>
            <p className="sports-kicker">Agenda oficial</p>
            <h2 id="sports-events-title">Eventos esportivos do campus</h2>
          </div>
          <Link className="text-link" to="/eventos">
            Todos os eventos <span aria-hidden="true">→</span>
          </Link>
        </div>
        {eventsLoading ? (
          <p className="notice" role="status">
            Carregando eventos esportivos…
          </p>
        ) : eventsError ? (
          <p className="notice notice-error" role="alert">
            Não foi possível carregar os eventos esportivos.
          </p>
        ) : sportsEvents.length ? (
          <div className="content-grid">
            {sportsEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <p className="sports-empty">
            {query ? "Nenhum evento esportivo corresponde à busca." : "Nenhum evento esportivo publicado no momento."}
          </p>
        )}
      </section>
    </div>
  );
}
