import { useEffect, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import { OpportunityCard } from "../components/OpportunityCard";
import { PaginationControls } from "../components/PaginationControls";
import { SearchField } from "../components/SearchField";
import {
  OpportunityApiError,
  createOpportunity,
  getOpportunity,
  getOpportunities,
  getOpportunityPublisherContexts,
  getProfessorVerificationRequests,
  reviewProfessorVerificationRequest,
  type OpportunityPublisherContext,
  type ProfessorVerificationRequest,
  type Opportunity,
  type OpportunityPage,
} from "../services/opportunities.js";

interface WebContext {
  keycloak: Keycloak;
}

const pageSize = 10;
const publisherOptions = [
  { value: "", label: "Todos" },
  { value: "PROFESSOR", label: "Professores" },
  { value: "DEPARTMENT", label: "Departamentos" },
  { value: "ACADEMIC_ENTITY", label: "Entidades acadêmicas" },
];

function publisherLabel(publisherType: string): string {
  switch (publisherType) {
    case "PROFESSOR":
      return "Professor(a)";
    case "DEPARTMENT":
      return "Departamento";
    case "ACADEMIC_ENTITY":
      return "Entidade acadêmica";
    default:
      return publisherType;
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

function isAvailable(opportunity: Opportunity): boolean {
  return (
    opportunity.status === "ACTIVE" && (!opportunity.deadline || new Date(opportunity.deadline).getTime() > Date.now())
  );
}

export function OpportunitiesPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [publisherType, setPublisherType] = useState("");
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<OpportunityPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [workflowError, setWorkflowError] = useState(false);
  const [publisherContexts, setPublisherContexts] = useState<OpportunityPublisherContext[]>([]);
  const [reviewQueues, setReviewQueues] = useState<
    { context: OpportunityPublisherContext; items: ProfessorVerificationRequest[] }[]
  >([]);
  const [workflowReload, setWorkflowReload] = useState(0);
  const [opportunityReload, setOpportunityReload] = useState(0);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publisherKey, setPublisherKey] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [opportunityCategory, setOpportunityCategory] = useState("");
  const [deadline, setDeadline] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishingMessage, setPublishingMessage] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");

  useEffect(() => {
    document.title = "UNIR — Oportunidades";
    let active = true;
    setLoading(true);
    setError(false);

    async function loadOpportunities() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const response = await getOpportunities(keycloak.token, {
          page,
          size: pageSize,
          q: query,
          category,
          publisherType,
        });
        if (active) setResults(response);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOpportunities();
    return () => {
      active = false;
    };
  }, [category, keycloak, opportunityReload, page, publisherType, query]);

  useEffect(() => {
    let active = true;
    setWorkflowLoading(true);
    setWorkflowError(false);

    async function loadPublisherWorkflow() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const contexts = (await getOpportunityPublisherContexts(keycloak.token)).items;
        const departmentContexts = contexts.filter((context) => context.publisherType === "DEPARTMENT");
        const queues = await Promise.all(
          departmentContexts.map(async (context) => ({
            context,
            items: (await getProfessorVerificationRequests(keycloak.token!, context.publisherId)).items,
          })),
        );
        if (active) {
          setPublisherContexts(contexts);
          setReviewQueues(queues);
          setPublisherKey((current) =>
            current && contexts.some((context) => `${context.publisherType}:${context.publisherId}` === current)
              ? current
              : contexts[0]
                ? `${contexts[0].publisherType}:${contexts[0].publisherId}`
                : "",
          );
        }
      } catch {
        if (active) setWorkflowError(true);
      } finally {
        if (active) setWorkflowLoading(false);
      }
    }

    void loadPublisherWorkflow();
    return () => {
      active = false;
    };
  }, [keycloak, workflowReload]);

  function updateFilter(update: () => void) {
    update();
    setPage(0);
  }

  const selectedPublisher = publisherContexts.find(
    (context) => `${context.publisherType}:${context.publisherId}` === publisherKey,
  );

  async function submitOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPublisher) return;
    setPublishing(true);
    setPublishingMessage("");
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await createOpportunity(keycloak.token, {
        title,
        description,
        publisherType: selectedPublisher.publisherType,
        publisherId: selectedPublisher.publisherId,
        category: opportunityCategory,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        externalUrl,
        imageUrl: imageUrl.trim() || null,
      });
      setPublishingMessage("Oportunidade publicada. Ela já está disponível no mural.");
      setTitle("");
      setDescription("");
      setOpportunityCategory("");
      setDeadline("");
      setExternalUrl("");
      setImageUrl("");
      setOpportunityReload((value) => value + 1);
      setPublishOpen(false);
    } catch (requestError) {
      setPublishingMessage(
        requestError instanceof OpportunityApiError && requestError.status === 403
          ? "O Campus não confirmou esse vínculo para publicação. Atualize a página e confira seus acessos."
          : "Não foi possível publicar. Confira os campos e tente novamente.",
      );
    } finally {
      setPublishing(false);
    }
  }

  async function reviewVerificationRequest(requestId: string, decision: "approve" | "reject") {
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await reviewProfessorVerificationRequest(keycloak.token, requestId, decision);
      setReviewMessage(decision === "approve" ? "Afiliação aprovada e ativada." : "Solicitação recusada.");
      setWorkflowReload((value) => value + 1);
    } catch {
      setReviewMessage("Campus não autorizou a revisão ou a solicitação já foi processada.");
    }
  }

  const total = results?.totalElements ?? 0;

  return (
    <div className="browse-page opportunities-page">
      <header className="opportunity-hero">
        <div className="opportunity-hero-copy">
          <p className="eyebrow">Campus integrado · curadoria acadêmica e profissional</p>
          <h1>Mural de Oportunidades &amp; Bolsas</h1>
          <p>
            Estágios, bolsas de iniciação científica, projetos de pesquisa e extensão divulgados por departamentos,
            professores e entidades acadêmicas da universidade.
          </p>
        </div>
        <div className="opportunity-active-count" aria-live="polite">
          <span className="opportunity-count-icon">
            <Icon name="check" width="20" height="20" />
          </span>
          <span>
            <strong>{loading && !results ? "—" : total}</strong>
            <small>oportunidades ativas</small>
          </span>
        </div>
      </header>

      <section className="opportunity-disclosure" aria-labelledby="opportunity-disclosure-title">
        <div className="opportunity-disclosure-icon">
          <Icon name="arrowUpRight" width="22" height="22" />
        </div>
        <div>
          <div className="opportunity-disclosure-heading">
            <h2 id="opportunity-disclosure-title">Canal de divulgação e encaminhamento externo</h2>
            <span>Diretriz UNIR</span>
          </div>
          <p>
            A UNIR divulga oportunidades validadas pelos publicadores cadastrados, mas não recebe currículos nem
            intermedeia a seleção. Ao se candidatar, você será encaminhado ao link externo informado no edital.
          </p>
        </div>
      </section>

      <section className="opportunity-publishing-tools" aria-labelledby="opportunity-publishing-title">
        <div className="opportunity-publishing-heading">
          <div>
            <p className="eyebrow">Publicação institucional</p>
            <h2 id="opportunity-publishing-title">Divulgue uma oportunidade</h2>
            <p>O Campus confirma seus vínculos institucionais antes de aceitar uma publicação.</p>
          </div>
          {!workflowLoading && publisherContexts.length > 0 && (
            <button className="button button-primary" type="button" onClick={() => setPublishOpen((open) => !open)}>
              {publishOpen ? "Fechar formulário" : "Publicar oportunidade"}
            </button>
          )}
        </div>

        {workflowLoading ? (
          <p className="notice" role="status">
            Verificando acessos institucionais…
          </p>
        ) : workflowError ? (
          <p className="notice notice-error" role="alert">
            Não foi possível confirmar os acessos no Campus. A publicação está indisponível.
          </p>
        ) : publisherContexts.length === 0 ? (
          <p className="opportunity-access-note">
            Seu perfil não tem um vínculo de publicação ativo. Professores podem solicitar a verificação institucional
            abaixo.
          </p>
        ) : null}

        {publishingMessage && (
          <p className="notice" role="status">
            {publishingMessage}
          </p>
        )}
        {publishOpen && selectedPublisher && (
          <form className="opportunity-publish-form" onSubmit={submitOpportunity}>
            <label>
              Publicar em nome de
              <select value={publisherKey} onChange={(event) => setPublisherKey(event.target.value)} required>
                {publisherContexts.map((context) => {
                  const key = `${context.publisherType}:${context.publisherId}`;
                  return (
                    <option key={key} value={key}>
                      {publisherLabel(context.publisherType)} · {context.name}
                    </option>
                  );
                })}
              </select>
            </label>
            <div className="opportunity-publish-fields">
              <label>
                Título
                <input value={title} onChange={(event) => setTitle(event.target.value)} required />
              </label>
              <label>
                Categoria
                <input
                  value={opportunityCategory}
                  onChange={(event) => setOpportunityCategory(event.target.value)}
                  required
                />
              </label>
              <label className="opportunity-publish-wide">
                Descrição
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                  rows={4}
                />
              </label>
              <label>
                Prazo
                <input type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
              </label>
              <label>
                Link externo de inscrição
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(event) => setExternalUrl(event.target.value)}
                  placeholder="https://…"
                  required
                />
              </label>
              <label className="opportunity-publish-wide">
                Imagem (opcional)
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://…"
                />
              </label>
            </div>
            <p className="opportunity-access-note">
              A UNIR divulga a oportunidade e encaminha para o link externo. Não há candidatura interna.
            </p>
            <button className="button button-primary" type="submit" disabled={publishing}>
              {publishing ? "Publicando…" : "Publicar no mural"}
            </button>
          </form>
        )}

        <details className="opportunity-professor-request">
          <summary>Sou professor e preciso verificar minha afiliação</summary>
          <p className="opportunity-access-note">
            A solicitação usa o curso, o departamento e a matrícula/SIAPE salvos no seu perfil acadêmico. Revise ou
            atualize esses dados antes de confirmar o pedido.
          </p>
          <Link className="button button-secondary" to="/perfil">
            Revisar perfil acadêmico
          </Link>
        </details>

        {reviewQueues.length > 0 && (
          <div className="opportunity-review-queues">
            <h3>Verificações docentes para seu departamento</h3>
            {reviewMessage && <p role="status">{reviewMessage}</p>}
            {reviewQueues.map(({ context, items }) => (
              <section key={context.publisherId} aria-label={`Pedidos de ${context.name}`}>
                <h4>{context.name}</h4>
                {items.length === 0 ? (
                  <p>Nenhum pedido pendente.</p>
                ) : (
                  items.map((item) => (
                    <article className="opportunity-review-item" key={item.id}>
                      <div>
                        <strong>{item.requesterName ?? item.title}</strong>
                        <span>Identificador informado: {item.payload.identifier ?? "não informado"}</span>
                      </div>
                      <div className="opportunity-review-actions">
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => void reviewVerificationRequest(item.id, "reject")}
                        >
                          Recusar
                        </button>
                        <button
                          className="button button-primary"
                          type="button"
                          onClick={() => void reviewVerificationRequest(item.id, "approve")}
                        >
                          Aprovar vínculo
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </section>
            ))}
          </div>
        )}
      </section>

      <section className="opportunity-filter-panel" aria-label="Buscar e filtrar oportunidades">
        <div className="opportunity-filter-search" role="search" aria-label="Buscar oportunidades">
          <SearchField
            label="Buscar oportunidades"
            placeholder="Buscar por cargo, laboratório, tecnologia ou departamento…"
            value={query}
            onChange={(value) => updateFilter(() => setQuery(value))}
          />
          <label className="opportunity-category-filter">
            <span>Categoria</span>
            <input
              type="search"
              value={category}
              onChange={(event) => updateFilter(() => setCategory(event.target.value))}
              placeholder="Ex.: estágio, pesquisa…"
              aria-label="Filtrar por categoria"
            />
          </label>
        </div>
        <div className="opportunity-publisher-filter">
          <span className="opportunity-filter-label">Publicador:</span>
          <div className="opportunity-filter-pills" role="group" aria-label="Filtrar por publicador">
            {publisherOptions.map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                className={publisherType === option.value ? "is-selected" : ""}
                aria-pressed={publisherType === option.value}
                onClick={() => updateFilter(() => setPublisherType(option.value))}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="opportunity-tips" aria-labelledby="opportunity-tips-title">
        <div className="opportunity-tips-heading">
          <h2 id="opportunity-tips-title">
            <Icon name="shield" width="20" height="20" /> Antes de se inscrever
          </h2>
          <span>Orientações para candidatura</span>
        </div>
        <div className="opportunity-tip-grid">
          <article>
            <strong>Leia os requisitos</strong>
            <span>Confira curso, período e documentos no edital.</span>
          </article>
          <article>
            <strong>Confira o prazo</strong>
            <span>O prazo exibido corresponde ao informado pelo publicador.</span>
          </article>
          <article>
            <strong>Use o canal oficial</strong>
            <span>A inscrição é feita diretamente no link externo.</span>
          </article>
        </div>
      </section>

      <section className="opportunity-results" aria-labelledby="opportunity-results-title">
        <div className="opportunity-results-heading">
          <div>
            <h2 id="opportunity-results-title">Oportunidades abertas</h2>
            <p>{loading ? "Atualizando resultados…" : `${total} resultados`}</p>
          </div>
          {results && results.totalPages > 0 && (
            <span>
              Página {results.page + 1} de {results.totalPages}
            </span>
          )}
        </div>

        {loading && !results ? (
          <p className="notice" role="status">
            Carregando oportunidades…
          </p>
        ) : error ? (
          <p className="notice notice-error" role="alert">
            Não foi possível carregar as oportunidades. Verifique a conexão e tente novamente.
          </p>
        ) : results?.items.length ? (
          <div className="opportunity-list">
            {results.items.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        ) : (
          <div className="empty-state opportunity-empty-state">
            <Icon name="search" width="24" height="24" />
            <strong>
              {query || category || publisherType ? "Nenhum resultado encontrado" : "Nenhuma oportunidade ativa"}
            </strong>
            <span>
              {query || category || publisherType
                ? "Ajuste os filtros para buscar outras oportunidades."
                : "As oportunidades divulgadas pela universidade aparecerão aqui."}
            </span>
          </div>
        )}

        {results && !loading && !error && (
          <PaginationControls page={results.page} totalPages={results.totalPages} onPageChange={setPage} />
        )}
      </section>
    </div>
  );
}

export function OpportunityDetailPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { opportunityId = "" } = useParams();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"not-found" | "unavailable" | null>(null);

  useEffect(() => {
    document.title = "UNIR — Detalhes da oportunidade";
    let active = true;

    async function loadOpportunity() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token || !opportunityId) throw new Error("Oportunidade indisponível.");
        const response = await getOpportunity(keycloak.token, opportunityId);
        if (active) setOpportunity(response);
      } catch (requestError) {
        if (!active) return;
        setFailure(
          requestError instanceof OpportunityApiError && requestError.status === 404 ? "not-found" : "unavailable",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOpportunity();
    return () => {
      active = false;
    };
  }, [keycloak, opportunityId]);

  if (loading) {
    return (
      <p className="notice" role="status">
        Carregando oportunidade…
      </p>
    );
  }

  if (failure || !opportunity) {
    return (
      <section className="empty-state opportunity-empty-state" role="alert">
        <strong>
          {failure === "not-found" ? "Oportunidade não encontrada" : "Não foi possível carregar a oportunidade"}
        </strong>
        <span>
          {failure === "not-found"
            ? "Este registro não existe ou não está disponível."
            : "Tente novamente em instantes."}
        </span>
        <Link className="button button-secondary" to="/oportunidades">
          Voltar ao mural
        </Link>
      </section>
    );
  }

  const available = isAvailable(opportunity);

  return (
    <div className="detail-page opportunity-detail-page">
      <Link className="back-link" to="/oportunidades">
        <Icon name="arrowLeft" width="17" height="17" /> Todas as oportunidades
      </Link>
      <article className="detail-main-card opportunity-detail-main">
        {opportunity.imageUrl && <img className="opportunity-detail-image" src={opportunity.imageUrl} alt="" />}
        <div className="opportunity-detail-badges">
          <span className="opportunity-type">{opportunity.category}</span>
          <span className={available ? "opportunity-detail-status" : "opportunity-detail-status is-closed"}>
            {available ? "Oportunidade ativa" : "Não disponível para candidatura"}
          </span>
        </div>
        <h1>{opportunity.title}</h1>
        <p className="opportunity-detail-publisher">Publicada por {publisherLabel(opportunity.publisherType)}</p>
        <section className="detail-copy-section">
          <h2>Sobre a oportunidade</h2>
          <p>{opportunity.description}</p>
        </section>
        <div className="detail-info-grid opportunity-detail-info">
          <div>
            <Icon name="calendar" />
            <span>
              <small>Prazo de inscrição</small>
              <strong>{formatDate(opportunity.deadline)}</strong>
            </span>
          </div>
          <div>
            <Icon name="opportunity" />
            <span>
              <small>Categoria</small>
              <strong>{opportunity.category}</strong>
            </span>
          </div>
          <div>
            <Icon name="profile" />
            <span>
              <small>Tipo de publicador</small>
              <strong>{publisherLabel(opportunity.publisherType)}</strong>
            </span>
          </div>
          <div>
            <Icon name="shield" />
            <span>
              <small>Identificador do publicador</small>
              <strong>{opportunity.publisherId}</strong>
            </span>
          </div>
          <div>
            <Icon name="calendar" />
            <span>
              <small>Publicado em</small>
              <strong>{formatDate(opportunity.createdAt)}</strong>
            </span>
          </div>
          <div>
            <Icon name="check" />
            <span>
              <small>Status informado</small>
              <strong>{opportunity.status}</strong>
            </span>
          </div>
        </div>
        <div className="opportunity-application-panel">
          <div>
            <strong>{available ? "Candidatura ou inscrição externa" : "Candidaturas encerradas"}</strong>
            <p>
              {available
                ? "Você seguirá para o endereço externo informado pelo publicador. A UNIR não recebe a candidatura."
                : "Esta oportunidade continua disponível para consulta, mas não está aberta para candidatura."}
            </p>
          </div>
          {available ? (
            <a
              className="button button-primary"
              href={opportunity.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Acessar link externo <Icon name="arrowUpRight" width="17" height="17" />
            </a>
          ) : (
            <span className="button button-secondary" aria-disabled="true">
              Prazo encerrado
            </span>
          )}
        </div>
      </article>
    </div>
  );
}
