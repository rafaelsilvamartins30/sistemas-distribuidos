import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import {
  CampusSocialApiError,
  getMyInstitutionalRequests,
  getPendingInstitutionalRequests,
  reviewInstitutionalRequest,
  type InstitutionalRequest,
} from "../services/campusSocial";

interface WebContext {
  keycloak: Keycloak;
}

function requestSummary(request: InstitutionalRequest): string {
  if (request.type === "PROFESSOR_VERIFICATION") {
    const identifier = request.payload.identifier;
    return typeof identifier === "string"
      ? `Matrícula / SIAPE: ${identifier}`
      : "Pedido de verificação do vínculo docente.";
  }
  const description = request.payload.description;
  return typeof description === "string" ? description : "Solicitação de cadastro de perfil.";
}

function RequestCard({
  request,
  canReview,
  onReview,
}: {
  request: InstitutionalRequest;
  canReview: boolean;
  onReview: (id: string, decision: "approve" | "reject") => void;
}) {
  return (
    <article className="campus-request-card">
      <header>
        <div>
          <span className="eyebrow">{request.type.replaceAll("_", " ")}</span>
          <h3>{request.title}</h3>
        </div>
        <span className={`campus-request-status is-${request.status.toLowerCase()}`}>{request.status}</span>
      </header>
      <p>{requestSummary(request)}</p>
      <dl>
        <div>
          <dt>Solicitante</dt>
          <dd>{request.requesterName || request.requestedByUserId}</dd>
        </div>
        <div>
          <dt>Destino</dt>
          <dd>{request.targetDepartmentName || "Universidade"}</dd>
        </div>
        <div>
          <dt>Enviado</dt>
          <dd>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(request.createdAt))}</dd>
        </div>
      </dl>
      {request.status === "PENDING" && canReview && (
        <div className="form-actions">
          <button className="button button-secondary" onClick={() => onReview(request.id, "reject")}>
            Recusar
          </button>
          <button className="button button-primary" onClick={() => onReview(request.id, "approve")}>
            Aprovar
          </button>
        </div>
      )}
    </article>
  );
}

export function CampusRequestsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [mine, setMine] = useState<InstitutionalRequest[]>([]);
  const [pending, setPending] = useState<InstitutionalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const token = keycloak.token ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [minePage, pendingPage] = await Promise.all([
        getMyInstitutionalRequests(token),
        getPendingInstitutionalRequests(token),
      ]);
      setMine(minePage.items);
      setPending(pendingPage.items);
    } catch (requestError) {
      setError(
        requestError instanceof CampusSocialApiError && requestError.status === 403
          ? "Você não tem permissão para consultar esta área."
          : "Não foi possível carregar as solicitações do Campus.",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    document.title = "UNIR — Solicitações";
    void load();
  }, [load]);

  async function review(id: string, decision: "approve" | "reject") {
    setReviewing(true);
    setError("");
    try {
      await reviewInstitutionalRequest(token, id, decision);
      await load();
    } catch {
      setError("O Campus recusou a decisão. Confirme se você administra o departamento ou a universidade do pedido.");
    } finally {
      setReviewing(false);
    }
  }

  return (
    <div className="campus-requests-page">
      <header className="page-intro product-page-intro">
        <p className="eyebrow">Campus</p>
        <h1>Solicitações</h1>
        <p>Acompanhe seus pedidos e analise os que foram enviados aos perfis que você administra.</p>
      </header>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="notice" role="status">
          Carregando solicitações…
        </p>
      ) : (
        <div className="campus-requests-grid">
          <section className="campus-social-panel">
            <header className="campus-social-heading">
              <div>
                <h2>Meus pedidos</h2>
                <p>O Campus preserva o histórico de decisões.</p>
              </div>
            </header>
            {mine.length ? (
              mine.map((request) => (
                <RequestCard key={request.id} request={request} canReview={false} onReview={() => undefined} />
              ))
            ) : (
              <div className="empty-state">
                <strong>Você ainda não enviou solicitações</strong>
              </div>
            )}
          </section>
          <section className="campus-social-panel">
            <header className="campus-social-heading">
              <div>
                <h2>Aguardando sua análise</h2>
                <p>Somente pedidos destinados aos seus departamentos e à universidade aparecem aqui.</p>
              </div>
            </header>
            {reviewing && (
              <p className="notice" role="status">
                Atualizando decisão…
              </p>
            )}
            {pending.length ? (
              pending.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  canReview
                  onReview={(id, decision) => void review(id, decision)}
                />
              ))
            ) : (
              <div className="empty-state">
                <strong>Nenhum pedido pendente para seus perfis</strong>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export function RequestProfileForm({
  token,
  type,
  onCreated,
  presentation = "inline",
}: {
  token: string;
  type: "COMMUNITY_CREATION" | "ENTITY_CREATION";
  onCreated?: () => void;
  presentation?: "inline" | "modal";
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; acronym: string }>>([]);
  const [targetDepartmentId, setTargetDepartmentId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [generalInfoMarkdown, setGeneralInfoMarkdown] = useState("");
  const [typeOrCategory, setTypeOrCategory] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  const title = type === "COMMUNITY_CREATION" ? "Solicitar uma comunidade" : "Solicitar uma entidade";

  useEffect(() => {
    if (presentation !== "modal") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open, presentation]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    import("../services/campus")
      .then(({ getDepartments }) => getDepartments(token, 0, 100))
      .then((page) => active && setDepartments(page.items))
      .catch(() => active && setError("Não foi possível carregar os departamentos."));
    return () => {
      active = false;
    };
  }, [open, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSent("");
    try {
      const { createInstitutionalRequest } = await import("../services/campusSocial");
      const payload = {
        name,
        description,
        generalInfoMarkdown,
        links: [],
        ...(type === "COMMUNITY_CREATION" ? { category: typeOrCategory || null } : { entityType: typeOrCategory }),
      };
      const created = await createInstitutionalRequest(token, type, targetDepartmentId || null, payload);
      setSent(`Pedido enviado para ${created.targetDepartmentName || "a Universidade"}. Protocolo ${created.id}.`);
      setName("");
      setDescription("");
      setGeneralInfoMarkdown("");
      setTypeOrCategory("");
      onCreated?.();
      if (presentation === "modal") setOpen(false);
    } catch {
      setError("Não foi possível enviar o pedido. Revise as informações e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const requestForm = (
    <form className="campus-post-composer" onSubmit={(event) => void submit(event)}>
      <p className="campus-request-explanation">
        O administrador do departamento ou da universidade escolhida analisará o pedido.
      </p>
      <label className="field">
        <span>Enviar para</span>
        <select value={targetDepartmentId} onChange={(event) => setTargetDepartmentId(event.target.value)}>
          <option value="">Universidade</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name} ({department.acronym})
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Nome</span>
        <input required maxLength={255} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {type === "ENTITY_CREATION" ? (
        <label className="field">
          <span>Tipo de entidade</span>
          <input required value={typeOrCategory} onChange={(event) => setTypeOrCategory(event.target.value)} />
        </label>
      ) : (
        <label className="field">
          <span>Categoria (opcional)</span>
          <input value={typeOrCategory} onChange={(event) => setTypeOrCategory(event.target.value)} />
        </label>
      )}
      <label className="field">
        <span>Descrição</span>
        <textarea required rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label className="field">
        <span>Informações em Markdown</span>
        <textarea
          required
          rows={4}
          value={generalInfoMarkdown}
          onChange={(event) => setGeneralInfoMarkdown(event.target.value)}
        />
      </label>
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <button className="button button-primary" disabled={busy} type="submit">
        {busy ? "Enviando…" : "Enviar para aprovação"}
      </button>
    </form>
  );

  return (
    <div className={`campus-request-form-wrap${presentation === "modal" ? " is-modal-trigger" : ""}`}>
      <button className="button button-secondary" type="button" onClick={() => setOpen((value) => !value)}>
        {presentation === "inline" && open ? "Fechar solicitação" : title}
      </button>
      {sent && (
        <p className="notice notice-success" role="status">
          {sent}
        </p>
      )}
      {presentation === "modal" ? (
        <dialog
          aria-labelledby={`profile-request-title-${type.toLowerCase()}`}
          className="profile-request-dialog"
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          onClose={() => setOpen(false)}
          ref={dialogRef}
        >
          <header>
            <div>
              <p className="eyebrow">Solicitação de perfil</p>
              <h2 id={`profile-request-title-${type.toLowerCase()}`}>{title}</h2>
              <p>Preencha os dados básicos. A equipe responsável analisará o pedido.</p>
            </div>
            <button className="dialog-close" type="button" aria-label="Fechar" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>
          {open && requestForm}
        </dialog>
      ) : open ? (
        requestForm
      ) : null}
    </div>
  );
}
