import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { SearchField } from "../components/SearchField";
import { Section } from "../components/Section";
import { findEntity, opportunities } from "../data/demoContent";

const filters = ["Todas", "Bolsa de pesquisa", "Processo seletivo", "Extensão", "Estágio"] as const;
type OpportunityFilter = (typeof filters)[number];

export function OpportunitiesPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OpportunityFilter>("Todas");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [interestedIds, setInterestedIds] = useState<string[]>([]);

  const visibleOpportunities = useMemo(
    () =>
      opportunities.filter((item) => {
        const searchable =
          `${item.title} ${item.publisher} ${item.description} ${item.eligibility} ${item.selection}`.toLocaleLowerCase(
            "pt-BR",
          );
        const matchesQuery = searchable.includes(query.trim().toLocaleLowerCase("pt-BR"));
        return matchesQuery && (filter === "Todas" || item.type === filter);
      }),
    [filter, query],
  );

  function toggleInterest(id: string) {
    setInterestedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="browse-page">
      <PageHeader
        eyebrow="Seu próximo passo"
        title="Oportunidades"
        description="Veja quem publicou, os requisitos e como cada oportunidade escolhe seus participantes."
      />
      <div className="page-search-toolbar" role="search" aria-label="Buscar oportunidades">
        <SearchField
          label="Buscar oportunidades"
          placeholder="Ex.: pesquisa, monitoria, estágio"
          value={query}
          onChange={setQuery}
        />
        <label className="page-filter">
          <span>Tipo</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as OpportunityFilter)}>
            {filters.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      <Section title="Oportunidades para você" description={`${visibleOpportunities.length} oportunidades de exemplo`}>
        <div className="content-grid">
          {visibleOpportunities.length ? (
            visibleOpportunities.map((item) => {
              const isExpanded = expandedId === item.id;
              const isInterested = interestedIds.includes(item.id);
              const publisher = item.publisherId ? findEntity(item.publisherId) : undefined;
              return (
                <article className="content-card opportunity-card" key={item.id}>
                  <div className="opportunity-card-top">
                    <span className="opportunity-type">{item.type}</span>
                    <span className="opportunity-deadline">
                      <Icon name="calendar" width="14" height="14" />
                      {item.deadline}
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="opportunity-organization">
                    Publicado por{" "}
                    {publisher ? <Link to={`/entidades/${publisher.id}`}>{item.publisher}</Link> : item.publisher}
                  </p>
                  <p className="opportunity-description">{item.description}</p>
                  <div className="opportunity-meta">
                    <span>
                      <Icon name="pin" width="15" height="15" />
                      {item.location}
                    </span>
                  </div>
                  <div className="opportunity-selection">
                    <span>Como acontece a seleção</span>
                    <strong>{item.selection}</strong>
                  </div>
                  {isExpanded && (
                    <div className="opportunity-detail">
                      <strong>Quem pode participar</strong>
                      <p>{item.eligibility}</p>
                      <strong>Próximo passo</strong>
                      <p>A organização responsável informará as etapas e os canais oficiais da inscrição.</p>
                    </div>
                  )}
                  <div className="opportunity-card-actions">
                    <button
                      className="opportunity-detail-button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      {isExpanded ? "Fechar detalhes" : "Ver requisitos"}
                      <Icon name="arrowUpRight" width="16" height="16" />
                    </button>
                    <button
                      className={`button ${isInterested ? "button-secondary" : "button-primary"}`}
                      aria-pressed={isInterested}
                      onClick={() => toggleInterest(item.id)}
                    >
                      {isInterested ? "Interesse registrado" : item.action}
                    </button>
                  </div>
                  {isInterested && (
                    <p className="inline-confirmation" role="status">
                      Seu interesse foi registrado nesta demonstração.
                    </p>
                  )}
                </article>
              );
            })
          ) : (
            <div className="empty-state">
              <Icon name="search" />
              <strong>Nenhuma oportunidade encontrada</strong>
              <span>Experimente outro termo ou tipo.</span>
            </div>
          )}
        </div>
      </Section>
      <p className="opportunity-footnote">
        <Icon name="check" width="15" height="15" /> Os cartões são demonstrativos; candidaturas e seleções ainda não
        são enviadas às organizações.
      </p>
    </div>
  );
}
