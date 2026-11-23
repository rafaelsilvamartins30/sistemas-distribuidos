import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { EventCard } from "../components/EventCard";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { Section } from "../components/Section";
import { ParticipantQrScanner } from "../components/ParticipantQrScanner";
import { SearchField } from "../components/SearchField";
import { UniversalAttendanceModal } from "../components/UniversalAttendanceModal";
import {
  AttendanceApiError,
  checkInWithEventQr,
  confirmOrganizerCheckIn,
  getMyAttendance,
  issueEventAttendanceQr,
  previewOrganizerCheckIn,
  type MyAttendance,
  type OrganizerCheckInPreview,
  type QrArtifact,
} from "../services/attendance";
import {
  EventApiError,
  cancelEvent,
  createEvent,
  getEvent,
  getEventOrganizerContexts,
  getEvents,
  getManagedEvents,
  isExternalPaidOrganizer,
  updateEvent,
  type AttendanceMode,
  type Event,
  type EventOrganizerContext,
  type RegistrationMode,
} from "../services/events";
import {
  cancelRegistration,
  getMyRegistrations,
  registerForEvent,
  RegistrationApiError,
  type Registration,
} from "../services/registrations";
import { getFollowedProfiles } from "../services/campusSocial";
import {
  attendanceInstructions,
  eventCategoryLabel,
  eventStatusLabel,
  filterEvents,
  organizerTypeLabel,
} from "../utils/eventPresentation";

interface WebContext {
  keycloak: Keycloak;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function toDateTimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function registrationModeLabel(event: Event): string {
  switch (event.registrationMode) {
    case "INTERNAL_FREE":
      return "Inscrição gratuita pela UNIR";
    case "INTERNAL_PAID":
      return "Inscrição paga pela UNIR (Pix)";
    case "EXTERNAL_PAID":
      return "Inscrição paga em link externo";
  }
}

function priceLabel(event: Event): string {
  if (event.registrationMode === "INTERNAL_FREE") return "Gratuito";
  if (event.price == null) return "Valor no link externo";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.price / 100);
}

function canCancel(registration: Registration): boolean {
  return Date.now() <= new Date(registration.event.startsAt).getTime() - 24 * 60 * 60 * 1000;
}

function registrationErrorMessage(error: unknown): string {
  if (!(error instanceof RegistrationApiError)) return "Não foi possível concluir a operação. Tente novamente.";
  switch (error.detail) {
    case "EVENT_FULL":
      return "As vagas deste evento já foram preenchidas.";
    case "ALREADY_REGISTERED":
      return "Você já tem uma inscrição confirmada neste evento.";
    case "EVENT_CANCELLED":
      return "Este evento foi cancelado e não aceita novas inscrições.";
    case "REGISTRATION_CLOSED":
      return "O prazo de inscrição deste evento terminou.";
    case "CANCELLATION_WINDOW_CLOSED":
      return "O cancelamento só pode ser feito até 24 horas antes do evento.";
    case "REGISTRATION_NOT_ACTIVE":
      return "Esta inscrição não está mais ativa.";
    default:
      return `Não foi possível concluir a operação (${error.status}).`;
  }
}

export function EventsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);
  const [eventQuery, setEventQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [followedOnly, setFollowedOnly] = useState(false);
  const [followedOrganizerKeys, setFollowedOrganizerKeys] = useState<Set<string>>(new Set());
  const [followedProfilesReady, setFollowedProfilesReady] = useState(false);

  const [organizerContexts, setOrganizerContexts] = useState<EventOrganizerContext[]>([]);
  const [managedEvents, setManagedEvents] = useState<Event[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [organizerKey, setOrganizerKey] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("ACADEMIC");
  const [location, setLocation] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");
  const [capacity, setCapacity] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [priceBrl, setPriceBrl] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>("PARTICIPANT_SCANS_EVENT");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editStartsAt, setEditStartsAt] = useState("");
  const [editEndsAt, setEditEndsAt] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editCapacity, setEditCapacity] = useState("");
  const [editPriceBrl, setEditPriceBrl] = useState("");
  const [editExternalUrl, setEditExternalUrl] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    async function loadEvents() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token indisponível.");
        const page = await getEvents(keycloak.token);
        if (active) setEvents(page.items);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadEvents();
    return () => {
      active = false;
    };
  }, [keycloak, reloadCount]);

  useEffect(() => {
    let active = true;
    async function loadFollowedProfiles() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token indisponível.");
        const follows = await getFollowedProfiles(keycloak.token);
        if (active) {
          setFollowedOrganizerKeys(new Set(follows.items.map((follow) => `${follow.targetType}:${follow.targetId}`)));
        }
      } catch {
        if (active) setFollowedOrganizerKeys(new Set());
      } finally {
        if (active) setFollowedProfilesReady(true);
      }
    }
    void loadFollowedProfiles();
    return () => {
      active = false;
    };
  }, [keycloak]);

  const visibleEvents = useMemo(
    () => filterEvents(events, { query: eventQuery, category: categoryFilter, followedOrganizerKeys, followedOnly }),
    [categoryFilter, eventQuery, events, followedOnly, followedOrganizerKeys],
  );
  const eventCategories = useMemo(
    () =>
      [...new Set(events.map((event) => event.category))].sort((left, right) =>
        eventCategoryLabel(left).localeCompare(eventCategoryLabel(right), "pt-BR"),
      ),
    [events],
  );

  useEffect(() => {
    let active = true;
    setWorkflowLoading(true);

    async function loadOrganizerWorkflow() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token indisponível.");
        const contexts = (await getEventOrganizerContexts(keycloak.token)).items;
        const managed = contexts.length > 0 ? (await getManagedEvents(keycloak.token, 0, 50)).items : [];
        if (active) {
          setOrganizerContexts(contexts);
          setManagedEvents(managed);
          setOrganizerKey((current) =>
            current && contexts.some((ctx) => `${ctx.organizerType}:${ctx.organizerId}` === current)
              ? current
              : contexts[0]
                ? `${contexts[0].organizerType}:${contexts[0].organizerId}`
                : "",
          );
        }
      } catch {
        if (active) {
          setOrganizerContexts([]);
          setManagedEvents([]);
        }
      } finally {
        if (active) setWorkflowLoading(false);
      }
    }

    void loadOrganizerWorkflow();
    return () => {
      active = false;
    };
  }, [keycloak, reloadCount]);

  const selectedOrganizer = organizerContexts.find((ctx) => `${ctx.organizerType}:${ctx.organizerId}` === organizerKey);
  const externalPaidMode = selectedOrganizer ? isExternalPaidOrganizer(selectedOrganizer.organizerType) : false;

  async function handleCreateEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!selectedOrganizer) return;
    setSubmitting(true);
    setFeedback("");
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");

      const registrationMode: RegistrationMode = !isPaid
        ? "INTERNAL_FREE"
        : externalPaidMode
          ? "EXTERNAL_PAID"
          : "INTERNAL_PAID";

      const parsedPriceMinor = isPaid && priceBrl.trim() ? Math.round(Number(priceBrl.replace(",", ".")) * 100) : null;

      await createEvent(keycloak.token, {
        title,
        description,
        organizerType: selectedOrganizer.organizerType,
        organizerId: selectedOrganizer.organizerId,
        location,
        category,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        registrationDeadline: new Date(registrationDeadline).toISOString(),
        capacity: capacity.trim() ? Number(capacity) : null,
        registrationMode,
        price: isPaid ? parsedPriceMinor : null,
        externalUrl: registrationMode === "EXTERNAL_PAID" ? externalUrl.trim() : null,
        imageUrl: imageUrl.trim() || null,
        attendanceEnabled: registrationMode !== "EXTERNAL_PAID" && attendanceEnabled,
        attendanceMode: registrationMode !== "EXTERNAL_PAID" && attendanceEnabled ? attendanceMode : null,
      });

      setFeedback("Evento criado e publicado na programação.");
      setTitle("");
      setDescription("");
      setLocation("");
      setStartsAt("");
      setEndsAt("");
      setRegistrationDeadline("");
      setCapacity("");
      setPriceBrl("");
      setExternalUrl("");
      setImageUrl("");
      setCreateOpen(false);
      setReloadCount((value) => value + 1);
    } catch {
      setFeedback("Não foi possível criar o evento. Confira as datas, o valor/link e seus acessos.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(item: Event) {
    setEditingEvent(item);
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditCategory(item.category);
    setEditLocation(item.location);
    setEditStartsAt(toDateTimeLocalValue(item.startsAt));
    setEditEndsAt(toDateTimeLocalValue(item.endsAt));
    setEditDeadline(toDateTimeLocalValue(item.registrationDeadline));
    setEditCapacity(item.capacity != null ? String(item.capacity) : "");
    setEditPriceBrl(item.price != null ? (item.price / 100).toFixed(2) : "");
    setEditExternalUrl(item.externalUrl ?? "");
    setEditImageUrl(item.imageUrl ?? "");
    setFeedback("");
  }

  async function handleSaveEdit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!editingEvent) return;
    setSubmitting(true);
    setFeedback("");
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");

      const parsedPriceMinor =
        editingEvent.registrationMode !== "INTERNAL_FREE" && editPriceBrl.trim()
          ? Math.round(Number(editPriceBrl.replace(",", ".")) * 100)
          : null;

      await updateEvent(keycloak.token, editingEvent.id, {
        title: editTitle,
        description: editDescription,
        category: editCategory,
        location: editLocation,
        startsAt: new Date(editStartsAt).toISOString(),
        endsAt: new Date(editEndsAt).toISOString(),
        registrationDeadline: new Date(editDeadline).toISOString(),
        capacity: editCapacity.trim() ? Number(editCapacity) : null,
        clearCapacity: !editCapacity.trim(),
        price: parsedPriceMinor,
        clearPrice: editingEvent.registrationMode === "INTERNAL_FREE" || !editPriceBrl.trim(),
        externalUrl: editingEvent.registrationMode === "EXTERNAL_PAID" ? editExternalUrl.trim() : null,
        imageUrl: editImageUrl.trim() || null,
        clearImageUrl: !editImageUrl.trim(),
      });

      setFeedback("Evento atualizado com sucesso.");
      setEditingEvent(null);
      setReloadCount((value) => value + 1);
    } catch {
      setFeedback("Não foi possível atualizar o evento. Confira as datas e valores informados.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelManagedEvent(targetEventId: string) {
    setFeedback("");
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");
      await cancelEvent(keycloak.token, targetEventId);
      if (editingEvent?.id === targetEventId) {
        setEditingEvent(null);
      }
      setFeedback("Evento cancelado. Inscrições vinculadas foram canceladas e eventuais estornos solicitados.");
      setReloadCount((value) => value + 1);
    } catch {
      setFeedback("Não foi possível cancelar o evento.");
    }
  }

  return (
    <div className="browse-page events-page">
      <div className="events-page-heading">
        <PageHeader
          eyebrow="Programação do Campus"
          title="Eventos & encontros universitários"
          description="Encontros, atividades e inscrições da comunidade universitária."
        />
        <Link className="button button-secondary" to="/tickets">
          <Icon name="calendar" width="16" height="16" /> Meus tickets
        </Link>
      </div>

      {!workflowLoading && organizerContexts.length > 0 && (
        <section className="opportunity-publishing-tools" aria-labelledby="event-organizing-title">
          <div className="opportunity-publishing-heading">
            <span className="opportunity-publishing-icon" aria-hidden="true">
              <Icon name="calendar" width="22" height="22" />
            </span>
            <div className="opportunity-publishing-copy">
              <p className="eyebrow">Administração de eventos</p>
              <h2 id="event-organizing-title">Criar e gerenciar eventos</h2>
              <p>
                Eventos pagos criados por <strong>Professor, Departamento ou Unidade Acadêmica</strong> usam pagamento
                interno pela UNIR (Pix / Saga). Eventos pagos criados por{" "}
                <strong>Comunidade ou Entidade Acadêmica</strong> usam inscrição externa.
              </p>
            </div>
            <div className="opportunity-publishing-actions">
              <button className="button button-primary" type="button" onClick={() => setCreateOpen(true)}>
                + Novo evento
              </button>
            </div>
          </div>

          {feedback && (
            <p className="notice" role="status" style={{ marginTop: "0.75rem" }}>
              {feedback}
            </p>
          )}

          {createOpen && selectedOrganizer && (
            <div
              className="sports-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-event-modal-title"
              onClick={() => setCreateOpen(false)}
            >
              <div className="sports-modal" style={{ maxWidth: "740px" }} onClick={(e) => e.stopPropagation()}>
                <header className="sports-modal-header">
                  <div>
                    <p className="sports-kicker">Administração de eventos</p>
                    <h2 id="create-event-modal-title">Novo evento</h2>
                  </div>
                  <button
                    type="button"
                    className="sports-modal-close"
                    aria-label="Fechar"
                    onClick={() => setCreateOpen(false)}
                  >
                    ✕
                  </button>
                </header>
                <div className="sports-modal-body">
                  <form className="opportunity-publish-form" onSubmit={handleCreateEvent}>
                    <label>
                      Organizar em nome de
                      <select value={organizerKey} onChange={(e) => setOrganizerKey(e.target.value)} required>
                        {organizerContexts.map((context) => {
                          const key = `${context.organizerType}:${context.organizerId}`;
                          return (
                            <option key={key} value={key}>
                              {organizerTypeLabel(context.organizerType)} · {context.name}
                            </option>
                          );
                        })}
                      </select>
                    </label>

                    <div className="opportunity-publish-fields">
                      <label>
                        Título do evento
                        <input value={title} onChange={(e) => setTitle(e.target.value)} required />
                      </label>
                      <label>
                        Categoria
                        <input value={category} onChange={(e) => setCategory(e.target.value)} required />
                      </label>
                      <label className="opportunity-publish-wide">
                        Descrição
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          required
                          rows={3}
                        />
                      </label>
                      <label>
                        Local
                        <input value={location} onChange={(e) => setLocation(e.target.value)} required />
                      </label>
                      <label>
                        Capacidade (opcional)
                        <input
                          type="number"
                          min="1"
                          value={capacity}
                          onChange={(e) => setCapacity(e.target.value)}
                          placeholder="Sem limite"
                        />
                      </label>
                      <label>
                        Início
                        <input
                          type="datetime-local"
                          value={startsAt}
                          onChange={(e) => setStartsAt(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Término
                        <input
                          type="datetime-local"
                          value={endsAt}
                          onChange={(e) => setEndsAt(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Data limite de inscrição
                        <input
                          type="datetime-local"
                          value={registrationDeadline}
                          onChange={(e) => setRegistrationDeadline(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Modalidade
                        <select value={isPaid ? "PAID" : "FREE"} onChange={(e) => setIsPaid(e.target.value === "PAID")}>
                          <option value="FREE">Gratuito (Inscrição interna UNIR)</option>
                          <option value="PAID">
                            {externalPaidMode
                              ? "Pago externo (Link da comunidade/entidade)"
                              : "Pago interno (Cobrança Pix pela UNIR — Saga)"}
                          </option>
                        </select>
                      </label>

                      {isPaid && !externalPaidMode && (
                        <label>
                          Valor da inscrição (R$)
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={priceBrl}
                            onChange={(e) => setPriceBrl(e.target.value)}
                            placeholder="Ex.: 25.00"
                            required
                          />
                        </label>
                      )}

                      {isPaid && externalPaidMode && (
                        <>
                          <label>
                            Link externo para pagamento e inscrição
                            <input
                              type="url"
                              value={externalUrl}
                              onChange={(e) => setExternalUrl(e.target.value)}
                              placeholder="https://…"
                              required
                            />
                          </label>
                          <label>
                            Valor informativo em R$ (opcional)
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={priceBrl}
                              onChange={(e) => setPriceBrl(e.target.value)}
                              placeholder="Ex.: 15.00"
                            />
                          </label>
                        </>
                      )}

                      {(!isPaid || !externalPaidMode) && (
                        <>
                          <label>
                            Lista de presença via QR
                            <select
                              value={attendanceEnabled ? "YES" : "NO"}
                              onChange={(e) => setAttendanceEnabled(e.target.value === "YES")}
                            >
                              <option value="YES">Habilitada</option>
                              <option value="NO">Desabilitada</option>
                            </select>
                          </label>
                          {attendanceEnabled && (
                            <label>
                              Modo de validação do QR
                              <select
                                value={attendanceMode}
                                onChange={(e) => setAttendanceMode(e.target.value as AttendanceMode)}
                              >
                                <option value="PARTICIPANT_SCANS_EVENT">Participante escaneia QR do evento</option>
                                <option value="ORGANIZER_SCANS_PARTICIPANT">
                                  Organizador escaneia QR do participante
                                </option>
                              </select>
                            </label>
                          )}
                        </>
                      )}

                      <label className="opportunity-publish-wide">
                        Imagem (opcional)
                        <input
                          type="url"
                          value={imageUrl}
                          onChange={(e) => setImageUrl(e.target.value)}
                          placeholder="https://…"
                        />
                      </label>
                    </div>

                    <div className="sports-form-actions">
                      <button className="button button-secondary" type="button" onClick={() => setCreateOpen(false)}>
                        Cancelar
                      </button>
                      <button className="button button-primary" type="submit" disabled={submitting}>
                        {submitting ? "Publicando…" : "Publicar evento"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {editingEvent && (
            <div
              className="sports-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-event-modal-title"
              onClick={() => setEditingEvent(null)}
            >
              <div className="sports-modal" style={{ maxWidth: "740px" }} onClick={(e) => e.stopPropagation()}>
                <header className="sports-modal-header">
                  <div>
                    <p className="sports-kicker">Administração de eventos</p>
                    <h2 id="edit-event-modal-title">Editar evento: {editingEvent.title}</h2>
                  </div>
                  <button
                    type="button"
                    className="sports-modal-close"
                    aria-label="Fechar"
                    onClick={() => setEditingEvent(null)}
                  >
                    ✕
                  </button>
                </header>
                <div className="sports-modal-body">
                  <form className="opportunity-publish-form" onSubmit={handleSaveEdit}>
                    <div className="opportunity-publish-fields">
                      <label>
                        Título
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                      </label>
                      <label>
                        Categoria
                        <input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} required />
                      </label>
                      <label className="opportunity-publish-wide">
                        Descrição
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          required
                          rows={3}
                        />
                      </label>
                      <label>
                        Local
                        <input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} required />
                      </label>
                      <label>
                        Capacidade (vazio = sem limite)
                        <input
                          type="number"
                          min="1"
                          value={editCapacity}
                          onChange={(e) => setEditCapacity(e.target.value)}
                        />
                      </label>
                      <label>
                        Início
                        <input
                          type="datetime-local"
                          value={editStartsAt}
                          onChange={(e) => setEditStartsAt(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Término
                        <input
                          type="datetime-local"
                          value={editEndsAt}
                          onChange={(e) => setEditEndsAt(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Data limite de inscrição
                        <input
                          type="datetime-local"
                          value={editDeadline}
                          onChange={(e) => setEditDeadline(e.target.value)}
                          required
                        />
                      </label>
                      {editingEvent.registrationMode !== "INTERNAL_FREE" && (
                        <label>
                          Valor em R$
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editPriceBrl}
                            onChange={(e) => setEditPriceBrl(e.target.value)}
                            required={editingEvent.registrationMode === "INTERNAL_PAID"}
                          />
                        </label>
                      )}
                      {editingEvent.registrationMode === "EXTERNAL_PAID" && (
                        <label className="opportunity-publish-wide">
                          Link externo de inscrição
                          <input
                            type="url"
                            value={editExternalUrl}
                            onChange={(e) => setEditExternalUrl(e.target.value)}
                            required
                          />
                        </label>
                      )}
                      <label className="opportunity-publish-wide">
                        Imagem (opcional)
                        <input type="url" value={editImageUrl} onChange={(e) => setEditImageUrl(e.target.value)} />
                      </label>
                    </div>
                    <div className="sports-form-actions">
                      <button className="button button-secondary" type="button" onClick={() => setEditingEvent(null)}>
                        Cancelar
                      </button>
                      <button className="button button-primary" type="submit" disabled={submitting}>
                        {submitting ? "Salvando…" : "Salvar alterações"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {managedEvents.length > 0 && (
            <div className="opportunity-review-queues">
              <h3>Seus eventos administrados</h3>
              {managedEvents.map((item) => (
                <article className="opportunity-review-item" key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {organizerTypeLabel(item.organizerType)} · {registrationModeLabel(item)} · {priceLabel(item)} ·
                      Inscrições até {dateTime(item.registrationDeadline)} · Status:{" "}
                      {item.status === "ACTIVE" ? "Ativo" : "Cancelado"}
                    </span>
                  </div>
                  {item.status === "ACTIVE" && (
                    <div className="opportunity-review-actions">
                      <button className="button button-secondary" type="button" onClick={() => startEditing(item)}>
                        Editar / Datas
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => void handleCancelManagedEvent(item.id)}
                      >
                        Cancelar evento
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="events-filter-toolbar" aria-label="Buscar e filtrar eventos">
        <SearchField
          label="Buscar eventos"
          placeholder="Buscar por nome, descrição ou local…"
          value={eventQuery}
          onChange={setEventQuery}
        />
        <label className="events-category-filter">
          <span>Categoria</span>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">Todas</option>
            {eventCategories.map((categoryName) => (
              <option key={categoryName} value={categoryName}>
                {eventCategoryLabel(categoryName)}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`events-follow-filter${followedOnly ? " is-selected" : ""}`}
          type="button"
          aria-pressed={followedOnly}
          disabled={!followedProfilesReady}
          onClick={() => setFollowedOnly((value) => !value)}
        >
          {followedProfilesReady ? "Perfis que sigo" : "Carregando perfis…"}
        </button>
      </div>

      <Section
        title="Programação"
        description={loading ? "Carregando eventos…" : `${visibleEvents.length} de ${events.length} eventos`}
      >
        {loading ? (
          <p className="notice" role="status">
            Carregando eventos…
          </p>
        ) : error ? (
          <p className="notice notice-error" role="alert">
            Não foi possível carregar os eventos. Verifique a conexão com a plataforma e tente novamente.
          </p>
        ) : visibleEvents.length ? (
          <div className="content-grid">
            {visibleEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Icon name="calendar" />
            <strong>{events.length ? "Nenhum evento encontrado" : "Nenhum evento disponível"}</strong>
            <span>
              {events.length
                ? followedOnly && followedOrganizerKeys.size === 0
                  ? "Você ainda não segue perfis que organizam eventos."
                  : "Ajuste a busca ou os filtros para ver outros eventos."
                : "Os próximos eventos aparecerão aqui."}
            </span>
          </div>
        )}
      </Section>
    </div>
  );
}

export function EventDetailPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const { eventId } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"not-found" | "unavailable" | null>(null);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<MyAttendance | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [manageFeedback, setManageFeedback] = useState<string | null>(null);
  const [organizerBusy, setOrganizerBusy] = useState(false);
  const [organizerError, setOrganizerError] = useState<string | null>(null);
  const [organizerQr, setOrganizerQr] = useState<QrArtifact | null>(null);
  const [attendanceModalMode, setAttendanceModalMode] = useState<"participant" | "organizer" | null>(null);
  const [scannedTicketToken, setScannedTicketToken] = useState("");
  const [scannedTicket, setScannedTicket] = useState<OrganizerCheckInPreview | null>(null);

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token || !eventId) throw new Error("Evento indisponível.");
        const [result, organizerContexts] = await Promise.all([
          getEvent(keycloak.token, eventId),
          getEventOrganizerContexts(keycloak.token).catch(() => ({ items: [] })),
        ]);
        if (active) {
          setEvent(result);
          setCanManage(
            organizerContexts.items.some(
              (ctx) => ctx.organizerType === result.organizerType && ctx.organizerId === result.organizerId,
            ),
          );
        }
        if (result.registrationMode !== "EXTERNAL_PAID") {
          const page = await getMyRegistrations(keycloak.token);
          const ownRegistration = page.items.find((item) => item.eventId === result.id) ?? null;
          if (active) setRegistration(ownRegistration);
        }
      } catch (error) {
        if (active) {
          if (error instanceof EventApiError) {
            setFailure(error.status === 404 ? "not-found" : "unavailable");
          } else if (error instanceof RegistrationApiError) {
            setRegistrationError("Não foi possível consultar sua inscrição neste momento.");
          } else {
            setFailure("unavailable");
          }
        }
      } finally {
        if (active) {
          setLoading(false);
          setRegistrationLoading(false);
        }
      }
    }

    void loadEvent();
    return () => {
      active = false;
    };
  }, [eventId, keycloak]);

  useEffect(() => {
    let active = true;
    if (!event?.attendanceEnabled || registration?.status !== "CONFIRMED" || !eventId) {
      setAttendance(null);
      setAttendanceLoading(false);
      return () => {
        active = false;
      };
    }
    const attendanceEventId = eventId;

    async function loadAttendance() {
      setAttendanceLoading(true);
      setAttendanceError(null);
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const result = await getMyAttendance(keycloak.token, attendanceEventId);
        if (active) setAttendance(result);
      } catch (error) {
        if (!active) return;
        if (error instanceof AttendanceApiError && error.status === 404) {
          setAttendance(null);
        } else {
          setAttendanceError("Não foi possível consultar sua presença. Tente novamente.");
        }
      } finally {
        if (active) setAttendanceLoading(false);
      }
    }

    void loadAttendance();
    return () => {
      active = false;
    };
  }, [event?.attendanceEnabled, eventId, keycloak, registration?.status]);

  async function handleRegister() {
    if (!event) return;
    setRegistrationBusy(true);
    setRegistrationError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setRegistration(await registerForEvent(keycloak.token, event.id));
    } catch (error) {
      setRegistrationError(registrationErrorMessage(error));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function handleCancel() {
    if (!registration) return;
    setRegistrationBusy(true);
    setRegistrationError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setRegistration(await cancelRegistration(keycloak.token, registration.id));
    } catch (error) {
      setRegistrationError(registrationErrorMessage(error));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function handleCancelEventByOrganizer() {
    if (!event) return;
    setRegistrationBusy(true);
    setManageFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");
      const updated = await cancelEvent(keycloak.token, event.id);
      setEvent(updated);
      setManageFeedback("Evento cancelado com sucesso.");
    } catch {
      setManageFeedback("Não foi possível cancelar o evento.");
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function handleRefreshRegistration() {
    if (!event) return;
    setRegistrationBusy(true);
    setRegistrationError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const page = await getMyRegistrations(keycloak.token);
      setRegistration(page.items.find((item) => item.eventId === event.id) ?? null);
    } catch (error) {
      setRegistrationError(registrationErrorMessage(error));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function handleCheckIn(qrToken: string) {
    setAttendanceBusy(true);
    setAttendanceError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const result = await checkInWithEventQr(keycloak.token, qrToken);
      setAttendance((current) => (current ? { ...current, status: "ATTENDED", checkedAt: result.checkedAt } : current));
      setAttendanceModalMode(null);
    } catch (error) {
      const detail = error instanceof AttendanceApiError ? error.detail : "Tente novamente mais tarde.";
      setAttendanceError(`Não foi possível registrar sua presença: ${detail}`);
    } finally {
      setAttendanceBusy(false);
    }
  }

  async function handleRefreshAttendance() {
    if (!event || !keycloak.token) return;
    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setAttendance(await getMyAttendance(keycloak.token, event.id));
    } catch (error) {
      if (error instanceof AttendanceApiError && error.status === 404) {
        setAttendance(null);
      } else {
        setAttendanceError("Não foi possível atualizar sua presença.");
      }
    } finally {
      setAttendanceLoading(false);
    }
  }

  async function handleIssueEventQr() {
    if (!event) return;
    setOrganizerBusy(true);
    setOrganizerError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setOrganizerQr(await issueEventAttendanceQr(keycloak.token, event.id));
    } catch (error) {
      const detail = error instanceof AttendanceApiError ? error.detail : "Tente novamente mais tarde.";
      setOrganizerError(`Não foi possível gerar o QR: ${detail}`);
    } finally {
      setOrganizerBusy(false);
    }
  }

  async function handlePreviewOrganizerCheckIn(token: string) {
    setOrganizerBusy(true);
    setOrganizerError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setScannedTicketToken(token);
      setScannedTicket(await previewOrganizerCheckIn(keycloak.token, token));
    } catch (error) {
      const detail = error instanceof AttendanceApiError ? error.detail : "Tente novamente mais tarde.";
      setOrganizerError(`Não foi possível validar o ticket: ${detail}`);
      setScannedTicket(null);
      setScannedTicketToken("");
    } finally {
      setOrganizerBusy(false);
    }
  }

  async function handleConfirmOrganizerCheckIn() {
    if (!scannedTicketToken) return;
    setOrganizerBusy(true);
    setOrganizerError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await confirmOrganizerCheckIn(keycloak.token, scannedTicketToken);
      setScannedTicket((current) => (current ? { ...current, status: "ATTENDED" } : current));
    } catch (error) {
      const detail = error instanceof AttendanceApiError ? error.detail : "Tente novamente mais tarde.";
      setOrganizerError(`Não foi possível confirmar a presença: ${detail}`);
    } finally {
      setOrganizerBusy(false);
    }
  }

  if (loading)
    return (
      <p className="notice" role="status">
        Carregando evento…
      </p>
    );
  if (failure || !event) {
    return (
      <div className="empty-state" role={failure === "unavailable" ? "alert" : undefined}>
        <strong>{failure === "not-found" ? "Evento não encontrado" : "Não foi possível carregar o evento"}</strong>
        <Link to="/eventos">Voltar aos eventos</Link>
      </div>
    );
  }

  return (
    <div className="detail-page event-detail-page">
      <Link className="back-link" to="/eventos">
        <Icon name="arrowLeft" width="16" height="16" /> Todos os eventos
      </Link>
      <div className="detail-layout">
        <article className="detail-main-card">
          {event.imageUrl && <img className="event-detail-image" src={event.imageUrl} alt="" />}
          <span className="eyebrow">
            {eventCategoryLabel(event.category)} · {eventStatusLabel(event.status)}
          </span>
          <h1>{event.title}</h1>
          <p className="detail-lead">{event.description}</p>
          <div className="detail-info-grid">
            <div>
              <Icon name="calendar" />
              <span>
                <small>Começa</small>
                <strong>{dateTime(event.startsAt)}</strong>
              </span>
            </div>
            <div>
              <Icon name="calendar" />
              <span>
                <small>Termina</small>
                <strong>{dateTime(event.endsAt)}</strong>
              </span>
            </div>
            <div>
              <Icon name="pin" />
              <span>
                <small>Local</small>
                <strong>{event.location}</strong>
              </span>
            </div>
            <div>
              <Icon name="communities" />
              <span>
                <small>Organizador</small>
                <strong>{organizerTypeLabel(event.organizerType)}</strong>
              </span>
            </div>
            <div>
              <Icon name="bookmark" />
              <span>
                <small>Inscrição</small>
                <strong>{registrationModeLabel(event)}</strong>
                <span>Prazo: {dateTime(event.registrationDeadline)}</span>
              </span>
            </div>
            <div>
              <Icon name="check" />
              <span>
                <small>Valor e capacidade</small>
                <strong>{priceLabel(event)}</strong>
                <span>{event.capacity ? `Capacidade total: ${event.capacity}` : "Capacidade não informada"}</span>
              </span>
            </div>
          </div>
          {event.registrationMode === "EXTERNAL_PAID" && event.externalUrl && (
            <p className="event-external-link">
              <a className="button button-primary" href={event.externalUrl} target="_blank" rel="noreferrer">
                Acessar link externo de inscrição <Icon name="arrowUpRight" width="16" height="16" />
              </a>
            </p>
          )}
          <section className="detail-copy-section">
            <h2>Presença</h2>
            <p>
              {event.attendanceEnabled
                ? attendanceInstructions(event.attendanceMode)
                : "Este evento não terá registro de presença."}
            </p>
          </section>
          {canManage && event.status === "ACTIVE" && (
            <section className="detail-copy-section">
              <h2>Administração do organizador</h2>
              {manageFeedback && <p role="status">{manageFeedback}</p>}
              <button
                className="button button-secondary"
                type="button"
                disabled={registrationBusy}
                onClick={() => void handleCancelEventByOrganizer()}
              >
                Cancelar evento (estorna inscrições pagas)
              </button>
            </section>
          )}
        </article>
        <aside className="detail-aside-card">
          <section className="registration-action-panel" aria-labelledby="registration-action-title">
            <h2 id="registration-action-title">Minha inscrição</h2>
            {event.registrationMode === "EXTERNAL_PAID" ? (
              <p>Este evento é organizado por comunidade/entidade com pagamento e inscrição no link externo oficial.</p>
            ) : registrationLoading ? (
              <p role="status">Consultando sua inscrição…</p>
            ) : registration?.status === "CONFIRMED" ? (
              <>
                <p className="registration-confirmed" role="status">
                  Inscrição confirmada
                </p>
                <p>Confirmada em {dateTime(registration.confirmedAt ?? registration.registeredAt)}.</p>
                {event.registrationMode === "INTERNAL_FREE" && canCancel(registration) ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={registrationBusy}
                    onClick={() => void handleCancel()}
                  >
                    {registrationBusy ? "Cancelando…" : "Cancelar inscrição"}
                  </button>
                ) : event.registrationMode === "INTERNAL_FREE" ? (
                  <p>O prazo para cancelamento (24 horas antes do evento) terminou.</p>
                ) : null}
              </>
            ) : registration?.status === "PENDING_PAYMENT" ? (
              <div className="payment-status-panel" role="status">
                <span className="payment-status-icon" aria-hidden="true">
                  <Icon name="clock" width="20" height="20" />
                </span>
                <div className="payment-status-copy">
                  <strong>Pagamento em processamento</strong>
                  <p>Seu lugar está reservado enquanto aguardamos a confirmação do Pix.</p>
                  {registration.paymentDeadlineAt && (
                    <p className="payment-status-deadline">
                      Pague até <strong>{dateTime(registration.paymentDeadlineAt)}</strong>.
                    </p>
                  )}
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={registrationBusy}
                    onClick={() => void handleRefreshRegistration()}
                  >
                    {registrationBusy ? "Atualizando…" : "Atualizar status"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {registration?.status === "CANCELLED_BY_USER" && (
                  <p role="status">Sua inscrição anterior foi cancelada.</p>
                )}
                {registration?.status === "PAYMENT_EXPIRED" && (
                  <p role="status">Sua reserva anterior expirou. Você pode tentar novamente.</p>
                )}
                {registration?.status === "PAYMENT_FAILED" && (
                  <p role="status">O pagamento da tentativa anterior não foi concluído.</p>
                )}
                {registration?.status === "CANCELLED_BY_EVENT" && <p role="status">O evento cancelou sua inscrição.</p>}
                <p>
                  {event.registrationMode === "INTERNAL_FREE"
                    ? "Inscreva-se gratuitamente usando sua conta UNIR."
                    : `Reserve sua vaga por ${priceLabel(event)}. A cobrança Pix será processada pela Saga da UNIR.`}
                </p>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={registrationBusy || event.status !== "ACTIVE"}
                  onClick={() => void handleRegister()}
                >
                  {registrationBusy
                    ? "Inscrevendo…"
                    : event.registrationMode === "INTERNAL_FREE"
                      ? "Inscrever-se gratuitamente"
                      : "Reservar vaga paga (Pix)"}
                </button>
              </>
            )}
            {registrationError && (
              <p className="notice notice-error" role="alert">
                {registrationError}
              </p>
            )}
          </section>
          {event.attendanceEnabled && registration?.status === "CONFIRMED" && (
            <section
              className="registration-action-panel attendance-action-panel"
              aria-labelledby="attendance-action-title"
            >
              <h2 id="attendance-action-title">Minha presença</h2>
              {event.attendanceMode !== "PARTICIPANT_SCANS_EVENT" ? (
                <p>Este evento utiliza validação de presença pela organização.</p>
              ) : attendanceLoading ? (
                <p role="status">Consultando sua elegibilidade…</p>
              ) : attendance?.status === "ATTENDED" ? (
                <p className="registration-confirmed" role="status">
                  Presença confirmada{attendance.checkedAt ? ` em ${dateTime(attendance.checkedAt)}` : ""}.
                </p>
              ) : attendance?.status === "ELIGIBLE" ? (
                <>
                  <p>
                    Leia o QR compartilhado ou informe o código do evento durante a atividade para registrar presença.
                  </p>
                  <p className="attendance-window">
                    Janela: {dateTime(event.startsAt)} a {dateTime(event.endsAt)}.
                  </p>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={attendanceBusy}
                    onClick={() => {
                      setAttendanceError(null);
                      setAttendanceModalMode("participant");
                    }}
                  >
                    Confirmar Presença
                  </button>
                </>
              ) : attendance?.status === "CANCELLED" ? (
                <p role="status">Sua elegibilidade para presença foi cancelada.</p>
              ) : attendance?.status === "NO_SHOW" ? (
                <p role="status">A presença foi encerrada e você consta como ausente.</p>
              ) : (
                <p role="status">Sua elegibilidade está sendo sincronizada. Atualize em instantes.</p>
              )}
              {event.attendanceMode === "PARTICIPANT_SCANS_EVENT" && attendance?.status !== "ATTENDED" && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={attendanceLoading || attendanceBusy}
                  onClick={() => void handleRefreshAttendance()}
                >
                  Atualizar presença
                </button>
              )}
              {attendanceError && (
                <p className="notice notice-error" role="alert">
                  {attendanceError}
                </p>
              )}
            </section>
          )}
          {event.attendanceEnabled && event.createdByUserId && keycloak.subject === event.createdByUserId && (
            <section
              className="registration-action-panel attendance-action-panel"
              aria-labelledby="organizer-attendance-title"
            >
              <h2 id="organizer-attendance-title">Organização do evento</h2>
              {event.attendanceMode === "PARTICIPANT_SCANS_EVENT" ? (
                <>
                  <p>Gere o QR compartilhado para os participantes registrarem a presença.</p>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={organizerBusy}
                    onClick={() => {
                      setAttendanceModalMode("organizer");
                      if (!organizerQr) {
                        void handleIssueEventQr();
                      }
                    }}
                  >
                    {organizerBusy ? "Gerando QR…" : organizerQr ? "Ver / Gerar QR do Evento" : "Gerar QR do Evento"}
                  </button>
                </>
              ) : (
                <>
                  <p>Leia o QR do participante e confira o identificador antes de confirmar a presença.</p>
                  <ParticipantQrScanner
                    busy={organizerBusy}
                    submitLabel="Verificar ticket"
                    onToken={(token) => void handlePreviewOrganizerCheckIn(token)}
                  />
                  {scannedTicket && (
                    <div className="organizer-ticket-preview" role="status">
                      <strong>
                        {scannedTicket.status === "ATTENDED" ? "Presença já registrada" : "Ticket válido"}
                      </strong>
                      <span>Evento: {scannedTicket.eventTitle}</span>
                      <span>Identificador do participante: {scannedTicket.participantUserId}</span>
                      {scannedTicket.status !== "ATTENDED" && (
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={organizerBusy}
                          onClick={() => void handleConfirmOrganizerCheckIn()}
                        >
                          Confirmar presença
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {organizerError && (
                <p className="notice notice-error" role="alert">
                  {organizerError}
                </p>
              )}
            </section>
          )}
          <span className="eyebrow">Evento</span>
          <p>Identificador do evento</p>
          <code>{event.id}</code>
          <p>Organizador: {organizerTypeLabel(event.organizerType)}</p>
        </aside>
      </div>

      {attendanceModalMode && (
        <UniversalAttendanceModal
          mode={attendanceModalMode}
          busy={attendanceModalMode === "participant" ? attendanceBusy : organizerBusy}
          title={
            attendanceModalMode === "participant" ? "Confirmar Presença no Evento" : "QR e Código de Presença do Evento"
          }
          subtitle={`${event.title} · ${dateTime(event.startsAt)}`}
          token={organizerQr?.token ?? null}
          qrSvg={organizerQr?.qrSvg ?? null}
          checkedIn={attendance?.status === "ATTENDED"}
          error={attendanceModalMode === "participant" ? attendanceError : organizerError}
          onSubmitToken={attendanceModalMode === "participant" ? (code) => void handleCheckIn(code) : undefined}
          onGenerateToken={attendanceModalMode === "organizer" ? () => void handleIssueEventQr() : undefined}
          onClose={() => setAttendanceModalMode(null)}
        />
      )}
    </div>
  );
}
