import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { EventCard } from "../components/EventCard";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { SearchField } from "../components/SearchField";
import type Keycloak from "keycloak-js";
import { useEventList } from "../hooks/useEventList";

interface WebContext {
  keycloak: Keycloak;
}

function isSportsCategory(category: string): boolean {
  const normalized = category
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /esport|futebol|futsal|volei|voleibol|basquete|handebol/.test(normalized);
}

export function SportsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { events, loading, error } = useEventList(keycloak);
  const [query, setQuery] = useState("");
  const sportsEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return events.filter((event) => {
      if (!isSportsCategory(event.category)) return false;
      return `${event.title} ${event.category} ${event.description} ${event.location}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedQuery);
    });
  }, [events, query]);

  return (
    <div className="browse-page capability-page">
      <PageHeader
        eyebrow="Atividades esportivas do Campus"
        title="Esportes"
        description="Encontre eventos esportivos publicados pela universidade e acompanhe as informações de inscrição."
      />
      <div className="page-search-toolbar" role="search" aria-label="Buscar eventos esportivos">
        <SearchField
          label="Buscar eventos esportivos"
          placeholder="Buscar por modalidade, evento ou local"
          value={query}
          onChange={setQuery}
        />
      </div>
      {loading ? (
        <p className="notice" role="status">
          Carregando eventos do Campus…
        </p>
      ) : error ? (
        <p className="notice notice-error" role="alert">
          Não foi possível carregar eventos. Tente novamente mais tarde.
        </p>
      ) : sportsEvents.length ? (
        <section className="page-section" aria-labelledby="sports-events-title">
          <div className="page-section-heading">
            <div>
              <h2 id="sports-events-title">Eventos esportivos publicados</h2>
              <p>
                {sportsEvents.length} {sportsEvents.length === 1 ? "evento" : "eventos"}
              </p>
            </div>
          </div>
          <div className="content-grid">
            {sportsEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      ) : (
        <div className="capability-empty capability-empty-compact">
          <span className="capability-empty-icon">
            <Icon name="opportunity" width="23" height="23" />
          </span>
          <h2>{query ? "Nenhum evento esportivo encontrado" : "Nenhum evento esportivo publicado"}</h2>
          <p>
            A lista usa eventos reais do Campus. Campeonatos, equipes e inscrições esportivas ainda não têm uma API
            própria nesta plataforma.
          </p>
          <Link className="button button-secondary" to="/eventos">
            Ver todos os eventos
          </Link>
        </div>
      )}
    </div>
  );
}
