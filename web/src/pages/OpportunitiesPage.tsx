import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import { OpportunityCard } from "../components/OpportunityCard";
import { PaginationControls } from "../components/PaginationControls";
import { useToast } from "../contexts/ToastContext";
import {
  OpportunityApiError,
  closeOpportunity,
  createOpportunity,
  getManagedOpportunities,
  getOpportunity,
  getOpportunities,
  getOpportunityPublisherContexts,
  getProfessorVerificationRequests,
  reviewProfessorVerificationRequest,
  updateOpportunity,
  type OpportunityPublisherContext,
  type ProfessorVerificationRequest,
  type Opportunity,
  type OpportunityPage,
} from "../services/opportunities.js";
import { extractErrorMessage } from "../utils/apiError.js";

interface WebContext {
  keycloak: Keycloak;
}

const pageSize = 10;
const opportunityTypes = [
  { name: "Estágio", description: "Vagas e processos seletivos." },
  { name: "Bolsa", description: "Bolsas acadêmicas e de apoio." },
  { name: "Pesquisa", description: "Projetos e iniciação científica." },
  { name: "Extensão", description: "Ações e projetos com a comunidade." },
  { name: "Monitoria", description: "Seleção para monitorias." },
  { name: "Outra", description: "Outras oportunidades do campus." },
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
  if (!value) return "Sem data limite";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

function toDateTimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function OpportunitiesPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<OpportunityPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [publisherContexts, setPublisherContexts] = useState<OpportunityPublisherContext[]>([]);
  const [managedOpportunities, setManagedOpportunities] = useState<Opportunity[]>([]);
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
  const [otherCategory, setOtherCategory] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editExternalUrl, setEditExternalUrl] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const publishDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = publishDialogRef.current;
    if (!dialog) return;
    if (publishOpen && !dialog.open) dialog.showModal();
    if (!publishOpen && dialog.open) dialog.close();
  }, [publishOpen]);

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
        });
        if (active) setResults(response);
      } catch (err) {
        if (active) {
          setError(true);
          toast.error(extractErrorMessage(err, "Não foi possível carregar as oportunidades."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOpportunities();
    return () => {
      active = false;
    };
  }, [keycloak, opportunityReload, page, toast]);

  useEffect(() => {
    let active = true;
    setWorkflowLoading(true);

    async function loadPublisherWorkflow() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const contexts = (await getOpportunityPublisherContexts(keycloak.token)).items;
        const departmentContexts = contexts.filter((context) => context.publisherType === "DEPARTMENT");
        const [queues, managedPage] = await Promise.all([
          Promise.all(
            departmentContexts.map(async (context) => ({
              context,
              items: (await getProfessorVerificationRequests(keycloak.token!, context.publisherId)).items,
            })),
          ),
          contexts.length > 0
            ? getManagedOpportunities(keycloak.token, 0, 50)
            : Promise.resolve({ items: [], page: 0, size: 50, totalElements: 0, totalPages: 0 }),
        ]);
        if (active) {
          setPublisherContexts(contexts);
          setReviewQueues(queues);
          setManagedOpportunities(managedPage.items);
          setPublisherKey((current) =>
            current && contexts.some((context) => `${context.publisherType}:${context.publisherId}` === current)
              ? current
              : contexts[0]
                ? `${contexts[0].publisherType}:${contexts[0].publisherId}`
                : "",
          );
        }
      } catch (err) {
        if (active) {
          toast.error(
            extractErrorMessage(
              err,
              "Não foi possível confirmar os acessos no Campus. A publicação está temporariamente indisponível.",
            ),
          );
        }
      } finally {
        if (active) setWorkflowLoading(false);
      }
    }

    void loadPublisherWorkflow();
    return () => {
      active = false;
    };
  }, [keycloak, opportunityReload, workflowReload, toast]);

  const selectedPublisher = publisherContexts.find(
    (context) => `${context.publisherType}:${context.publisherId}` === publisherKey,
  );

  function startEditing(opportunity: Opportunity) {
    setEditingOpportunity(opportunity);
    setEditTitle(opportunity.title);
    setEditDescription(opportunity.description);
    setEditCategory(opportunity.category);
    setEditDeadline(toDateTimeLocalValue(opportunity.deadline));
    setEditExternalUrl(opportunity.externalUrl);
    setPublishOpen(true);
  }

  async function submitOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPublisher) return;
    const category = opportunityCategory === "Outra" ? otherCategory.trim() : opportunityCategory;
    if (!category) {
      toast.error("Escolha o tipo da oportunidade para continuar.");
      return;
    }
    setPublishing(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await createOpportunity(keycloak.token, {
        title,
        description,
        publisherType: selectedPublisher.publisherType,
        publisherId: selectedPublisher.publisherId,
        category,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        externalUrl,
      });
      toast.success("Oportunidade publicada. Ela já está disponível no mural.");
      setTitle("");
      setDescription("");
      setOpportunityCategory("");
      setOtherCategory("");
      setDeadline("");
      setExternalUrl("");
      setOpportunityReload((value) => value + 1);
      setPublishOpen(false);
    } catch (requestError) {
      toast.error(
        requestError instanceof OpportunityApiError && requestError.status === 403
          ? "O Campus não confirmou esse vínculo para publicação. Atualize a página e confira seus acessos."
          : extractErrorMessage(
              requestError,
              "Não foi possível publicar. Confira os campos e a data de disponibilidade.",
            ),
      );
    } finally {
      setPublishing(false);
    }
  }

  async function submitEditOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingOpportunity) return;
    setSavingEdit(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await updateOpportunity(keycloak.token, editingOpportunity.id, {
        title: editTitle,
        description: editDescription,
        category: editCategory,
        deadline: editDeadline ? new Date(editDeadline).toISOString() : null,
        clearDeadline: !editDeadline,
        externalUrl: editExternalUrl,
      });
      toast.success("Oportunidade atualizada com sucesso.");
      setEditingOpportunity(null);
      setPublishOpen(false);
      setOpportunityReload((value) => value + 1);
    } catch (requestError) {
      toast.error(
        extractErrorMessage(
          requestError,
          "Não foi possível atualizar a oportunidade. Verifique se a data de disponibilidade é futura.",
        ),
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleRemoveOpportunity(opportunityId: string) {
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await closeOpportunity(keycloak.token, opportunityId);
      if (editingOpportunity?.id === opportunityId) {
        setEditingOpportunity(null);
      }
      toast.success("Oportunidade removida do mural ativo.");
      setOpportunityReload((value) => value + 1);
    } catch (requestError) {
      toast.error(extractErrorMessage(requestError, "Não foi possível remover a oportunidade."));
    }
  }

  async function handleReactivateOpportunity(opportunity: Opportunity) {
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await updateOpportunity(keycloak.token, opportunity.id, { reactivate: true });
      toast.success("Oportunidade reativada no mural.");
      setOpportunityReload((value) => value + 1);
    } catch (requestError) {
      toast.error(
        extractErrorMessage(requestError, "Não foi possível reativar. Ajuste a data de disponibilidade em Editar."),
      );
    }
  }

  async function reviewVerificationRequest(requestId: string, decision: "approve" | "reject") {
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await reviewProfessorVerificationRequest(keycloak.token, requestId, decision);
      toast.success(decision === "approve" ? "Afiliação aprovada e ativada." : "Solicitação recusada.");
      setWorkflowReload((value) => value + 1);
    } catch (requestError) {
      toast.error(
        extractErrorMessage(requestError, "Campus não autorizou a revisão ou a solicitação já foi processada."),
      );
    }
  }

  const total = results?.totalElements ?? 0;

  return (
    <div className="browse-page opportunities-page">
      <header className="opportunity-hero">
        <div className="opportunity-hero-copy">
          <p className="eyebrow">Campus integrado · divulgação acadêmica e profissional</p>
          <h1>Mural de Oportunidades &amp; Bolsas</h1>
          <p>
            Estágios, bolsas de iniciação científica, projetos de pesquisa e extensão publicados por departamentos,
            entidades acadêmicas e professores verificados.
          </p>
        </div>
        <div className="opportunity-active-count" aria-live="polite">
          <span className="opportunity-count-icon">
            <Icon name="check" width="20" height="20" />
          </span>
          <span>
            <strong>{loading && !results ? "—" : total}</strong>
            <small>oportunidades disponíveis</small>
          </span>
        </div>
      </header>

      {(!workflowLoading || publisherContexts.length > 0) && (
        <section className="opportunity-publishing-tools" aria-labelledby="opportunity-publishing-title">
          <div className="opportunity-publishing-heading">
            <span className="opportunity-publishing-icon" aria-hidden="true">
              <Icon name="opportunity" width="22" height="22" />
            </span>
            <div className="opportunity-publishing-copy">
              <p className="eyebrow">Publicação institucional</p>
              <h2 id="opportunity-publishing-title">Divulgue uma oportunidade</h2>
              <p>
                {publisherContexts.length > 0
                  ? "Compartilhe vagas, bolsas e projetos com a comunidade universitária."
                  : "Professores e administradores podem publicar oportunidades após confirmar o vínculo institucional."}
              </p>
            </div>
            <div className="opportunity-publishing-actions">
              {publisherContexts.length > 0 ? (
                <>
                  <span className="opportunity-access-badge">
                    <Icon name="check" width="15" height="15" /> Acesso confirmado
                  </span>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={() => {
                      setEditingOpportunity(null);
                      setPublishOpen(true);
                    }}
                  >
                    <span aria-hidden="true">＋</span> Nova publicação
                  </button>
                </>
              ) : (
                <Link className="button button-secondary opportunity-verify-link" to="/perfil">
                  Revisar perfil acadêmico
                </Link>
              )}
            </div>
          </div>

          <dialog
            aria-labelledby="opportunity-compose-title"
            className="social-composer-dialog opportunity-compose-dialog"
            onCancel={(event) => {
              event.preventDefault();
              setPublishOpen(false);
              setEditingOpportunity(null);
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setPublishOpen(false);
                setEditingOpportunity(null);
              }
            }}
            onClose={() => setPublishOpen(false)}
            ref={publishDialogRef}
          >
            <header>
              <div>
                <p className="eyebrow">Oportunidades · Campus</p>
                <h2 id="opportunity-compose-title">{editingOpportunity ? "Editar publicação" : "Nova publicação"}</h2>
                <p>
                  {editingOpportunity
                    ? "Atualize as informações e mantenha a comunidade a par."
                    : "Escolha o tipo e compartilhe os detalhes com a comunidade universitária."}
                </p>
              </div>
              <button
                className="dialog-close"
                type="button"
                aria-label="Fechar"
                onClick={() => {
                  setPublishOpen(false);
                  setEditingOpportunity(null);
                }}
              >
                ×
              </button>
            </header>

            {publishOpen && selectedPublisher && (
              <form className="social-composer-form opportunity-publish-form" onSubmit={submitOpportunity}>
                <label className="field">
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
                <fieldset className="opportunity-type-fieldset">
                  <legend>O que você quer divulgar?</legend>
                  <div
                    className="social-post-kind-picker opportunity-type-picker"
                    role="group"
                    aria-label="Tipo da oportunidade"
                  >
                    {opportunityTypes.map((type) => (
                      <button
                        key={type.name}
                        type="button"
                        aria-pressed={opportunityCategory === type.name}
                        className={opportunityCategory === type.name ? "is-selected" : ""}
                        onClick={() => setOpportunityCategory(type.name)}
                      >
                        <strong>{type.name}</strong>
                        <span>{type.description}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                {opportunityCategory === "Outra" && (
                  <label className="field">
                    Qual é o tipo?
                    <input value={otherCategory} onChange={(event) => setOtherCategory(event.target.value)} required />
                  </label>
                )}
                <div className="opportunity-publish-fields">
                  <label className="field">
                    Título
                    <input value={title} onChange={(event) => setTitle(event.target.value)} required />
                  </label>
                  <label className="field opportunity-publish-wide">
                    Informações da oportunidade
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      required
                      rows={4}
                    />
                  </label>
                  <label className="field">
                    Disponível até (opcional)
                    <input
                      type="datetime-local"
                      value={deadline}
                      onChange={(event) => setDeadline(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Link externo de inscrição
                    <input
                      type="url"
                      value={externalUrl}
                      onChange={(event) => setExternalUrl(event.target.value)}
                      placeholder="https://…"
                      required
                    />
                  </label>
                </div>
                <div className="social-composer-actions">
                  <button className="button button-secondary" type="button" onClick={() => setPublishOpen(false)}>
                    Cancelar
                  </button>
                  <button className="button button-primary" type="submit" disabled={publishing}>
                    {publishing ? "Publicando…" : "Publicar no mural"}
                  </button>
                </div>
              </form>
            )}

            {editingOpportunity && (
              <form className="social-composer-form opportunity-publish-form" onSubmit={submitEditOpportunity}>
                <h3>Editar oportunidade: {editingOpportunity.title}</h3>
                <div className="opportunity-publish-fields">
                  <label className="field">
                    Título
                    <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required />
                  </label>
                  <label className="field">
                    Categoria
                    <input value={editCategory} onChange={(event) => setEditCategory(event.target.value)} required />
                  </label>
                  <label className="field opportunity-publish-wide">
                    Informações da oportunidade
                    <textarea
                      value={editDescription}
                      onChange={(event) => setEditDescription(event.target.value)}
                      required
                      rows={4}
                    />
                  </label>
                  <label className="field">
                    Data de disponibilidade (vazio = sem data limite)
                    <input
                      type="datetime-local"
                      value={editDeadline}
                      onChange={(event) => setEditDeadline(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    Link externo de inscrição
                    <input
                      type="url"
                      value={editExternalUrl}
                      onChange={(event) => setEditExternalUrl(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <div className="social-composer-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => {
                      setEditingOpportunity(null);
                      setPublishOpen(false);
                    }}
                  >
                    Cancelar
                  </button>
                  <button className="button button-primary" type="submit" disabled={savingEdit}>
                    {savingEdit ? "Salvando…" : "Salvar alterações"}
                  </button>
                </div>
              </form>
            )}
          </dialog>

          {publisherContexts.length > 0 && managedOpportunities.length > 0 && (
            <details className="opportunity-management-disclosure">
              <summary>Minhas publicações ({managedOpportunities.length})</summary>
              <div className="opportunity-review-queues">
                {managedOpportunities.map((item) => {
                  const activeNow = item.available;
                  return (
                    <article className="opportunity-review-item" key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          {publisherLabel(item.publisherType)} · {item.category} · Disponível até:{" "}
                          {formatDate(item.deadline)} · Status: {activeNow ? "Ativa no mural" : "Fora do mural"}
                        </span>
                      </div>
                      <div className="opportunity-review-actions">
                        <button className="button button-secondary" type="button" onClick={() => startEditing(item)}>
                          Editar / Data
                        </button>
                        {item.canClose && (
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => void handleRemoveOpportunity(item.id)}
                          >
                            Apagar do mural
                          </button>
                        )}
                        {item.canReactivate && (
                          <button
                            className="button button-primary"
                            type="button"
                            onClick={() => void handleReactivateOpportunity(item)}
                          >
                            Reativar
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </details>
          )}

          {publisherContexts.length === 0 && (
            <p className="opportunity-access-note">
              A solicitação de vínculo usa o departamento e a matrícula/SIAPE do seu perfil acadêmico.
            </p>
          )}

          {reviewQueues.length > 0 && (
            <details className="opportunity-management-disclosure">
              <summary>Solicitações de afiliação docente</summary>
              <div className="opportunity-review-queues">
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
            </details>
          )}
        </section>
      )}

      <section className="opportunity-results" aria-labelledby="opportunity-results-title">
        <div className="opportunity-results-heading">
          <div>
            <h2 id="opportunity-results-title">Oportunidades disponíveis</h2>
            <p>{loading ? "Atualizando mural…" : `${total} oportunidades ativas`}</p>
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
        ) : !error && results?.items.length ? (
          <div className="opportunity-list">
            {results.items.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} />
            ))}
          </div>
        ) : (
          <div className="empty-state opportunity-empty-state">
            <Icon name="opportunity" width="24" height="24" />
            <strong>Nenhuma oportunidade ativa no momento</strong>
            <span>As oportunidades divulgadas por departamentos, entidades e professores aparecerão aqui.</span>
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
  const toast = useToast();
  const { opportunityId = "" } = useParams();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"not-found" | "unavailable" | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editExternalUrl, setEditExternalUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "UNIR — Detalhes da oportunidade";
    let active = true;

    async function loadOpportunity() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token || !opportunityId) throw new Error("Oportunidade indisponível.");
        const response = await getOpportunity(keycloak.token, opportunityId);
        if (!active) return;
        setOpportunity(response);
        setEditTitle(response.title);
        setEditDescription(response.description);
        setEditCategory(response.category);
        setEditDeadline(toDateTimeLocalValue(response.deadline));
        setEditExternalUrl(response.externalUrl);
      } catch (requestError) {
        if (!active) return;
        setFailure(
          requestError instanceof OpportunityApiError && requestError.status === 404 ? "not-found" : "unavailable",
        );
        toast.error(extractErrorMessage(requestError, "Não foi possível carregar a oportunidade."));
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOpportunity();
    return () => {
      active = false;
    };
  }, [keycloak, opportunityId, toast]);

  async function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!opportunity) return;
    setBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");
      const updated = await updateOpportunity(keycloak.token, opportunity.id, {
        title: editTitle,
        description: editDescription,
        category: editCategory,
        deadline: editDeadline ? new Date(editDeadline).toISOString() : null,
        clearDeadline: !editDeadline,
        externalUrl: editExternalUrl,
      });
      setOpportunity(updated);
      setEditing(false);
      toast.success("Oportunidade atualizada.");
    } catch (requestError) {
      toast.error(
        extractErrorMessage(
          requestError,
          "Não foi possível salvar. Confira se a data de disponibilidade está no futuro.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!opportunity) return;
    setBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");
      const updated = await closeOpportunity(keycloak.token, opportunity.id);
      setOpportunity(updated);
      toast.success("Oportunidade removida do mural ativo.");
    } catch (requestError) {
      toast.error(extractErrorMessage(requestError, "Não foi possível remover a oportunidade."));
    } finally {
      setBusy(false);
    }
  }

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

  const available = opportunity.available;

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
            {available ? "Oportunidade ativa" : "Inscrições encerradas"}
          </span>
        </div>
        <h1>{opportunity.title}</h1>
        <p className="opportunity-detail-publisher">Publicada por {publisherLabel(opportunity.publisherType)}</p>
        <section className="detail-copy-section">
          <h2>Informações da oportunidade</h2>
          <p>{opportunity.description}</p>
        </section>
        <div className="detail-info-grid opportunity-detail-info">
          <div>
            <Icon name="calendar" />
            <span>
              <small>Disponível até</small>
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
              <small>Publicador</small>
              <strong>{publisherLabel(opportunity.publisherType)}</strong>
            </span>
          </div>
          <div>
            <Icon name="calendar" />
            <span>
              <small>Publicado em</small>
              <strong>{formatDate(opportunity.createdAt)}</strong>
            </span>
          </div>
        </div>
        <div className="opportunity-application-panel">
          <div>
            <strong>{available ? "Inscrição externa" : "Período de disponibilidade encerrado"}</strong>
            <p>
              {available
                ? "Acesse o link oficial informado pelo publicador para realizar sua inscrição."
                : "Esta oportunidade não está mais aberta para novas inscrições."}
            </p>
          </div>
          {available ? (
            <a
              className="button button-primary"
              href={opportunity.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Acessar link de inscrição <Icon name="arrowUpRight" width="17" height="17" />
            </a>
          ) : (
            <span className="button button-secondary" aria-disabled="true">
              Indisponível
            </span>
          )}
        </div>

        {opportunity.canManage && (
          <section className="opportunity-publishing-tools" aria-label="Administrar esta oportunidade">
            <div className="opportunity-publishing-heading">
              <span className="opportunity-publishing-icon" aria-hidden="true">
                <Icon name="opportunity" width="22" height="22" />
              </span>
              <div className="opportunity-publishing-copy">
                <p className="eyebrow">Administração do publicador</p>
                <h2>Gerenciar publicação</h2>
              </div>
              <div className="opportunity-publishing-actions" style={{ display: "flex", gap: "0.5rem" }}>
                <button className="button button-primary" type="button" onClick={() => setEditing(true)}>
                  Editar / Alterar data
                </button>
                {opportunity.canClose && (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => void handleClose()}
                  >
                    Apagar do mural
                  </button>
                )}
              </div>
            </div>
            {editing && (
              <div
                className="sports-modal-backdrop"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-opportunity-modal-title"
                onClick={() => setEditing(false)}
              >
                <div className="sports-modal" style={{ maxWidth: "700px" }} onClick={(e) => e.stopPropagation()}>
                  <header className="sports-modal-header">
                    <div>
                      <p className="sports-kicker">Administração do publicador</p>
                      <h2 id="edit-opportunity-modal-title">Editar oportunidade</h2>
                    </div>
                    <button
                      type="button"
                      className="sports-modal-close"
                      aria-label="Fechar"
                      onClick={() => setEditing(false)}
                    >
                      ✕
                    </button>
                  </header>
                  <div className="sports-modal-body">
                    <form className="opportunity-publish-form" onSubmit={handleSaveEdit}>
                      <div className="opportunity-publish-fields">
                        <label>
                          Título
                          <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required />
                        </label>
                        <label>
                          Categoria
                          <input
                            value={editCategory}
                            onChange={(event) => setEditCategory(event.target.value)}
                            required
                          />
                        </label>
                        <label className="opportunity-publish-wide">
                          Informações da oportunidade
                          <textarea
                            value={editDescription}
                            onChange={(event) => setEditDescription(event.target.value)}
                            required
                            rows={4}
                          />
                        </label>
                        <label>
                          Data de disponibilidade (vazio = sem data limite)
                          <input
                            type="datetime-local"
                            value={editDeadline}
                            onChange={(event) => setEditDeadline(event.target.value)}
                          />
                        </label>
                        <label>
                          Link externo de inscrição
                          <input
                            type="url"
                            value={editExternalUrl}
                            onChange={(event) => setEditExternalUrl(event.target.value)}
                            required
                          />
                        </label>
                      </div>
                      <div className="sports-form-actions">
                        <button className="button button-secondary" type="button" onClick={() => setEditing(false)}>
                          Cancelar
                        </button>
                        <button className="button button-primary" type="submit" disabled={busy}>
                          {busy ? "Salvando…" : "Salvar e manter ativa"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </article>
    </div>
  );
}
