import { formatBrl } from "../utils/currency.js";
import { RegistrationRefundPolicy } from "../components/RegistrationRefundPolicy";
import { RegistrationPaymentNotice } from "../components/RegistrationPaymentNotice";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { EventCard } from "../components/EventCard";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { PaymentCheckoutModal } from "../components/PaymentCheckoutModal";
import { Section } from "../components/Section";
import { SearchField } from "../components/SearchField";
import { UniversalAttendanceModal } from "../components/UniversalAttendanceModal";
import { useToast } from "../contexts/ToastContext";
import { findPendingPaymentCharge, type PaymentCharge } from "../services/payments.js";
import { extractErrorMessage } from "../utils/apiError.js";
import {
  AttendanceApiError,
  checkInWithEventQr,
  confirmOrganizerCheckIn,
  getMyAttendance,
  getOrganizerAttendanceAction,
  type OrganizerAttendanceAction,
  issueEventAttendanceQr,
  reviewEventAttendance,
  type EventAttendanceReview,
  issueMyTicketQr,
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
  updateEvent,
  type AttendanceMode,
  type Event,
  type EventOrganizerContext,
  type RegistrationMode,
} from "../services/events";
import {
  cancelRegistration,
  getMyEventRegistration,
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
  return formatBrl(event.price);
}

function eventFormError(error: unknown, fallback: string): string {
  if (!(error instanceof EventApiError)) return extractErrorMessage(error, fallback);
  switch (error.code) {
    case "EVENT_END_NOT_AFTER_START":
      return "O término deve ser depois do início do evento.";
    case "EVENT_DEADLINE_AFTER_END":
      return "O prazo de inscrição deve terminar até o fim do evento.";
    case "EVENT_DEADLINE_NOT_FUTURE":
      return "Escolha um prazo de inscrição no futuro.";
    case "EVENT_INVALID_CAPACITY":
      return "Informe uma capacidade maior que zero ou deixe o campo vazio.";
    case "EVENT_UNSUPPORTED_PAID_MODE":
      return "A modalidade de pagamento mudou. Reabra o formulário para atualizar as opções.";
    case "EVENT_PAID_PRICE_REQUIRED":
      return "Informe um valor maior que zero para a inscrição paga por Pix.";
    case "EVENT_NEGATIVE_PRICE":
      return "Informe um valor igual ou maior que zero.";
    case "EVENT_EXTERNAL_URL_REQUIRED":
      return "Informe um link de inscrição válido, começando com http:// ou https://.";
    default:
      return error.status === 403
        ? "Você não tem permissão para gerenciar este evento."
        : extractErrorMessage(error, fallback);
  }
}

function registrationErrorMessage(error: unknown): string {
  if (!(error instanceof RegistrationApiError)) {
    return extractErrorMessage(error, "Não foi possível concluir a operação. Tente novamente.");
  }
  switch (error.detail) {
    case "EVENT_UNAVAILABLE":
      return "As inscrições estão temporariamente indisponíveis.";
    case "EVENT_PRICE_NOT_CONFIGURED":
      return "O valor da inscrição ainda não está disponível.";
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
    case "ONLY_FREE_REGISTRATIONS_CAN_BE_CANCELLED":
      return "Inscrições pagas só são estornadas se a organização cancelar o evento.";
    case "REGISTRATION_NOT_ACTIVE":
      return "Esta inscrição não está mais ativa.";
    default:
      return extractErrorMessage(error, `Não foi possível concluir a operação (${error.status}).`);
  }
}

export function EventsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const toast = useToast();
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
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>("PARTICIPANT_SCANS_EVENT");
  const [submitting, setSubmitting] = useState(false);

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
      } catch (err) {
        if (active) {
          setError(true);
          toast.error(extractErrorMessage(err, "Não foi possível carregar os eventos."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadEvents();
    return () => {
      active = false;
    };
  }, [keycloak, reloadCount, toast]);

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
  const externalPaidMode = selectedOrganizer?.paidRegistrationMode === "EXTERNAL_PAID";

  async function handleCreateEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!selectedOrganizer) return;
    setSubmitting(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");

      const registrationMode: RegistrationMode = isPaid ? selectedOrganizer.paidRegistrationMode : "INTERNAL_FREE";

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
        attendanceEnabled: registrationMode !== "EXTERNAL_PAID" && attendanceEnabled,
        attendanceMode: registrationMode !== "EXTERNAL_PAID" && attendanceEnabled ? attendanceMode : null,
      });

      toast.success("Evento criado e publicado na programação.");
      setTitle("");
      setDescription("");
      setLocation("");
      setStartsAt("");
      setEndsAt("");
      setRegistrationDeadline("");
      setCapacity("");
      setPriceBrl("");
      setExternalUrl("");
      setCreateOpen(false);
      setReloadCount((value) => value + 1);
    } catch (error) {
      toast.error(eventFormError(error, "Não foi possível criar o evento. Tente novamente."));
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
  }

  async function handleSaveEdit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!editingEvent) return;
    setSubmitting(true);
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
      });

      toast.success("Evento atualizado com sucesso.");
      setEditingEvent(null);
      setReloadCount((value) => value + 1);
    } catch (error) {
      toast.error(eventFormError(error, "Não foi possível atualizar o evento. Tente novamente."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelManagedEvent(targetEventId: string) {
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");
      await cancelEvent(keycloak.token, targetEventId);
      if (editingEvent?.id === targetEventId) {
        setEditingEvent(null);
      }
      toast.success("Evento cancelado. Inscrições vinculadas foram canceladas e eventuais estornos solicitados.");
      setReloadCount((value) => value + 1);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível cancelar o evento."));
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
                interno pela UNIR (Pix). Eventos pagos criados por <strong>Comunidade ou Entidade Acadêmica</strong>{" "}
                usam inscrição externa.
              </p>
            </div>
            <div className="opportunity-publishing-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() => {
                  setCreateOpen(true);
                }}
              >
                + Novo evento
              </button>
            </div>
          </div>

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
                              : "Pago interno (Cobrança Pix pela UNIR)"}
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
                  {item.viewerCanManage === true && (item._links?.update || item._links?.cancel) && (
                    <div className="opportunity-review-actions">
                      {item._links.update && (
                        <button className="button button-secondary" type="button" onClick={() => startEditing(item)}>
                          Editar / Datas
                        </button>
                      )}
                      {item._links.cancel && (
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => void handleCancelManagedEvent(item.id)}
                        >
                          Cancelar evento
                        </button>
                      )}
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
        ) : !error && visibleEvents.length ? (
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
  const toast = useToast();
  const { eventId } = useParams();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"not-found" | "unavailable" | null>(null);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [attendance, setAttendance] = useState<MyAttendance | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [organizerPermission, setOrganizerPermission] = useState<{
    eventId: string;
    action: OrganizerAttendanceAction | null;
  } | null>(null);
  const organizerAction = organizerPermission?.eventId === eventId ? organizerPermission?.action : null;
  const [attendanceReview, setAttendanceReview] = useState<EventAttendanceReview | null>(null);
  const [attendanceReviewLoading, setAttendanceReviewLoading] = useState(false);
  const [organizerBusy, setOrganizerBusy] = useState(false);
  const [participantQr, setParticipantQr] = useState<QrArtifact | null>(null);
  const [organizerQr, setOrganizerQr] = useState<QrArtifact | null>(null);
  const [attendanceModalMode, setAttendanceModalMode] = useState<
    "participant" | "organizer" | "participant-ticket" | null
  >(null);
  const [scannedTicketToken, setScannedTicketToken] = useState("");
  const [scannedTicket, setScannedTicket] = useState<OrganizerCheckInPreview | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentCharge, setPaymentCharge] = useState<PaymentCharge | null>(null);
  const [paymentChargeLoading, setPaymentChargeLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token || !eventId) throw new Error("Evento indisponível.");
        const result = await getEvent(keycloak.token, eventId);
        if (active) setEvent(result);
        if (result.registrationMode !== "EXTERNAL_PAID") {
          const ownRegistration = await getMyEventRegistration(keycloak.token, result.id);
          if (active) setRegistration(ownRegistration);
        }
      } catch (error) {
        if (active) {
          if (error instanceof EventApiError) {
            setFailure(error.status === 404 ? "not-found" : "unavailable");
            toast.error(extractErrorMessage(error, "Não foi possível carregar o evento."));
          } else if (error instanceof RegistrationApiError) {
            toast.error(extractErrorMessage(error, "Não foi possível consultar sua inscrição neste momento."));
          } else {
            setFailure("unavailable");
            toast.error(extractErrorMessage(error, "Não foi possível carregar o evento."));
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
  }, [eventId, keycloak, toast]);

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
          toast.error(extractErrorMessage(error, "Não foi possível consultar sua presença. Tente novamente."));
        }
      } finally {
        if (active) setAttendanceLoading(false);
      }
    }

    void loadAttendance();
    return () => {
      active = false;
    };
  }, [event?.attendanceEnabled, eventId, keycloak, registration?.status, toast]);

  useEffect(() => {
    let active = true;
    setOrganizerPermission(null);
    setAttendanceReview(null);
    setOrganizerQr(null);
    setAttendanceModalMode((current) => (current === "organizer" ? null : current));
    setScannedTicket(null);
    setScannedTicketToken("");
    if (event?.id === eventId && event?.attendanceEnabled) {
      void (async () => {
        try {
          await keycloak.updateToken(30);
          if (!keycloak.token) return;
          const result = await getOrganizerAttendanceAction(keycloak.token, event.id);
          if (active) setOrganizerPermission({ eventId: event.id, action: result.action });
        } catch {
          if (active) setOrganizerPermission(null);
        }
      })();
    }
    return () => {
      active = false;
    };
  }, [event?.id, event?.attendanceEnabled, event?.status, eventId, keycloak]);

  async function openEventPaymentCheckout(registrationId: string) {
    setPaymentModalOpen(true);
    setPaymentChargeLoading(true);
    setPaymentCharge(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const charge = await findPendingPaymentCharge(keycloak.token, {
        referenceId: registrationId,
        targetPath: event ? `/eventos/${event.id}` : null,
      });
      setPaymentCharge(charge);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível carregar a cobrança Pix."));
    } finally {
      setPaymentChargeLoading(false);
    }
  }

  async function refreshConfirmedRegistration() {
    if (!event) return;
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) return;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const current = await getMyEventRegistration(keycloak.token, event.id);
        setRegistration(current);
        if (current?.status === "CONFIRMED") return;
        if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch {
      // ignore transient refresh failure; user can still refresh manually
    }
  }

  async function handleRegister() {
    if (!event) return;
    setRegistrationBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const created = await registerForEvent(keycloak.token, event.id);
      setRegistration(created);
      if (created.status === "PENDING_PAYMENT") {
        toast.info("Vaga reservada! Conclua o Pix para confirmar sua inscrição.");
        void openEventPaymentCheckout(created.id);
      } else {
        toast.success("Inscrição confirmada com sucesso!");
      }
    } catch (error) {
      toast.error(registrationErrorMessage(error));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function handleCancel() {
    if (!registration) return;
    setRegistrationBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setRegistration(await cancelRegistration(keycloak.token, registration.id));
      const updatedEvent = await getEvent(keycloak.token, registration.eventId).catch(() => null);
      if (updatedEvent) setEvent(updatedEvent);
      toast.success("Inscrição cancelada.");
    } catch (error) {
      toast.error(registrationErrorMessage(error));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function handleCancelEventByOrganizer() {
    if (!event) return;
    setRegistrationBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");
      const updated = await cancelEvent(keycloak.token, event.id);
      setEvent(updated);
      toast.success("Evento cancelado com sucesso.");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível cancelar o evento."));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function handleRefreshRegistration() {
    if (!event) return;
    setRegistrationBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const [updatedEvent, updatedRegistration] = await Promise.all([
        getEvent(keycloak.token, event.id),
        getMyEventRegistration(keycloak.token, event.id),
      ]);
      setEvent(updatedEvent);
      setRegistration(updatedRegistration);
    } catch (error) {
      toast.error(registrationErrorMessage(error));
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function handleCheckIn(qrToken: string) {
    setAttendanceBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const result = await checkInWithEventQr(keycloak.token, qrToken);
      setAttendance((current) =>
        current ? { ...current, status: result.status, action: null, checkedAt: result.checkedAt } : current,
      );
      setAttendanceModalMode(null);
      toast.success("Presença confirmada com sucesso!");
    } catch (error) {
      const detail =
        error instanceof AttendanceApiError ? error.detail : extractErrorMessage(error, "Tente novamente mais tarde.");
      toast.error(`Não foi possível registrar sua presença: ${detail}`);
    } finally {
      setAttendanceBusy(false);
    }
  }

  async function handleRefreshAttendance() {
    if (!event || !keycloak.token) return;
    setAttendanceLoading(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setAttendance(await getMyAttendance(keycloak.token, event.id));
    } catch (error) {
      if (error instanceof AttendanceApiError && error.status === 404) {
        setAttendance(null);
      } else {
        toast.error(extractErrorMessage(error, "Não foi possível atualizar sua presença."));
      }
    } finally {
      setAttendanceLoading(false);
    }
  }

  async function handleIssueParticipantQr() {
    if (!event) return;
    setAttendanceBusy(true);
    setAttendanceModalMode("participant-ticket");
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setParticipantQr(await issueMyTicketQr(keycloak.token, event.id));
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível gerar seu QR de entrada."));
      setAttendanceModalMode(null);
    } finally {
      setAttendanceBusy(false);
    }
  }

  async function handleAttendanceReview(close = false) {
    if (!event) return;
    if (close) setOrganizerBusy(true);
    else setAttendanceReviewLoading(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão indisponível.");
      setAttendanceReview(await reviewEventAttendance(keycloak.token, event.id, close));
      if (close) toast.success("Lista de presença fechada.");
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível consultar as presenças."));
    } finally {
      if (close) setOrganizerBusy(false);
      else setAttendanceReviewLoading(false);
    }
  }

  function handleOpenOrganizerAttendance() {
    setAttendanceModalMode("organizer");
    void handleAttendanceReview(false);
    if (organizerAction === "GENERATE_EVENT_QR" && !organizerQr) {
      void handleIssueEventQr();
    }
  }

  async function handleIssueEventQr() {
    if (!event) return;
    setOrganizerBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setOrganizerQr(await issueEventAttendanceQr(keycloak.token, event.id));
      toast.success("QR Code de presença liberado.");
    } catch (error) {
      const detail =
        error instanceof AttendanceApiError ? error.detail : extractErrorMessage(error, "Tente novamente mais tarde.");
      toast.error(`Não foi possível gerar o QR: ${detail}`);
    } finally {
      setOrganizerBusy(false);
    }
  }

  async function handlePreviewOrganizerCheckIn(token: string) {
    setOrganizerBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setScannedTicketToken(token);
      setScannedTicket(await previewOrganizerCheckIn(keycloak.token, token));
    } catch (error) {
      const detail =
        error instanceof AttendanceApiError ? error.detail : extractErrorMessage(error, "Tente novamente mais tarde.");
      toast.error(`Não foi possível validar o ticket: ${detail}`);
      setScannedTicket(null);
      setScannedTicketToken("");
    } finally {
      setOrganizerBusy(false);
    }
  }

  async function handleConfirmOrganizerCheckIn() {
    if (!scannedTicketToken) return;
    setOrganizerBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await confirmOrganizerCheckIn(keycloak.token, scannedTicketToken);
      setScannedTicket((current) => (current ? { ...current, status: "ATTENDED" } : current));
      toast.success("Presença do participante confirmada.");
      void handleAttendanceReview(false);
    } catch (error) {
      const detail =
        error instanceof AttendanceApiError ? error.detail : extractErrorMessage(error, "Tente novamente mais tarde.");
      toast.error(`Não foi possível confirmar a presença: ${detail}`);
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
          {event.viewerCanManage === true && event._links?.cancel && (
            <section className="detail-copy-section">
              <h2>Administração do organizador</h2>
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
                {registration.canCancel ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={registrationBusy}
                    onClick={() => void handleCancel()}
                  >
                    {registrationBusy ? "Cancelando…" : "Cancelar inscrição"}
                  </button>
                ) : registration.cancellationBlockedReason === "CANCELLATION_WINDOW_CLOSED" ? (
                  <p>O prazo para cancelamento (24 horas antes do evento) terminou.</p>
                ) : registration.cancellationBlockedReason === "ONLY_FREE_REGISTRATIONS_CAN_BE_CANCELLED" ? (
                  <RegistrationRefundPolicy origin="eventos" />
                ) : null}
              </>
            ) : registration?.status === "PENDING_PAYMENT" ? (
              <div className="registration-payment-actions">
                <RegistrationPaymentNotice
                  origin="eventos"
                  deadline={registration.paymentDeadlineAt ? dateTime(registration.paymentDeadlineAt) : undefined}
                  busy={paymentChargeLoading}
                  onPayNow={() => void openEventPaymentCheckout(registration.id)}
                />
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={registrationBusy}
                  onClick={() => void handleRefreshRegistration()}
                >
                  {registrationBusy ? "Atualizando…" : "Atualizar status"}
                </button>
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
                    : `Reserve sua vaga por ${priceLabel(event)}. Após reservar, conclua o Pix em Meus pagamentos.`}
                </p>
                {event.registrationMode === "INTERNAL_PAID" && <RegistrationRefundPolicy origin="eventos" />}
                {event.registrationBlockedReason && (
                  <p role="status">
                    {registrationErrorMessage(new RegistrationApiError(409, event.registrationBlockedReason))}
                  </p>
                )}
                <button
                  className="button button-primary"
                  type="button"
                  disabled={registrationBusy || event.registrationBlockedReason !== null}
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
          </section>
          {event.attendanceEnabled && registration?.status === "CONFIRMED" && (
            <section
              className="registration-action-panel attendance-action-panel"
              aria-labelledby="attendance-action-title"
            >
              <h2 id="attendance-action-title">Minha presença</h2>
              {attendanceLoading ? (
                <p role="status">Consultando sua elegibilidade…</p>
              ) : attendance?.status === "ATTENDED" ? (
                <p className="registration-confirmed" role="status">
                  Presença confirmada{attendance.checkedAt ? ` em ${dateTime(attendance.checkedAt)}` : ""}.
                </p>
              ) : attendance?.action === "SCAN_EVENT_QR" ? (
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
                      setAttendanceModalMode("participant");
                    }}
                  >
                    Confirmar Presença
                  </button>
                </>
              ) : attendance?.action === "GENERATE_PARTICIPANT_QR" ? (
                <button
                  className="button button-primary"
                  type="button"
                  disabled={attendanceBusy}
                  onClick={() => void handleIssueParticipantQr()}
                >
                  Abrir meu QR de entrada
                </button>
              ) : attendance?.status === "CANCELLED" ? (
                <p role="status">Sua elegibilidade para presença foi cancelada.</p>
              ) : attendance?.status === "NO_SHOW" ? (
                <p role="status">A presença foi encerrada e você consta como ausente.</p>
              ) : (
                <p role="status">Sua elegibilidade está sendo sincronizada. Atualize em instantes.</p>
              )}
              {attendance?.status !== "ATTENDED" && (
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={attendanceLoading || attendanceBusy}
                  onClick={() => void handleRefreshAttendance()}
                >
                  Atualizar presença
                </button>
              )}
            </section>
          )}
          {organizerAction && (
            <section
              className="registration-action-panel attendance-action-panel"
              aria-labelledby="organizer-attendance-title"
            >
              <h2 id="organizer-attendance-title">Organização do evento</h2>
              <p>
                {organizerAction === "REVIEW_ATTENDANCE"
                  ? "Consulte a lista de presentes e faça o fechamento definitivo da presença deste evento."
                  : organizerAction === "GENERATE_EVENT_QR"
                    ? "Gere o QR Code de presença e acompanhe em tempo real quem já realizou check-in."
                    : "Valide os tickets QR dos participantes e acompanhe a lista de presença em tempo real."}
              </p>
              <button
                className="button button-primary"
                type="button"
                disabled={organizerBusy}
                onClick={handleOpenOrganizerAttendance}
              >
                Presença e QR Code
              </button>
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
          busy={attendanceModalMode === "organizer" ? organizerBusy : attendanceBusy}
          title={
            attendanceModalMode === "participant"
              ? "Confirmar Presença no Evento"
              : attendanceModalMode === "participant-ticket"
                ? "Meu QR de entrada"
                : event.title
          }
          subtitle={`${event.title} · ${dateTime(event.startsAt)}`}
          token={(attendanceModalMode === "participant-ticket" ? participantQr : organizerQr)?.token ?? null}
          qrSvg={(attendanceModalMode === "participant-ticket" ? participantQr : organizerQr)?.qrSvg ?? null}
          checkedIn={attendance?.status === "ATTENDED"}
          organizerCanManageQr={organizerAction === "GENERATE_EVENT_QR"}
          organizerScanMode={organizerAction === "SCAN_PARTICIPANT_QR"}
          scannedTicket={scannedTicket}
          onPreviewParticipantQr={(code) => void handlePreviewOrganizerCheckIn(code)}
          onConfirmParticipantQr={() => void handleConfirmOrganizerCheckIn()}
          attendanceReview={attendanceReview}
          attendanceListLoading={attendanceReviewLoading}
          canCloseAttendance={organizerAction === "REVIEW_ATTENDANCE"}
          onRefreshAttendanceList={() => void handleAttendanceReview(false)}
          onCloseAttendanceList={() => void handleAttendanceReview(true)}
          onSubmitToken={attendanceModalMode === "participant" ? (code) => void handleCheckIn(code) : undefined}
          onGenerateToken={
            attendanceModalMode === "organizer"
              ? () => void handleIssueEventQr()
              : attendanceModalMode === "participant-ticket"
                ? () => void handleIssueParticipantQr()
                : undefined
          }
          onClose={() => setAttendanceModalMode(null)}
        />
      )}

      {paymentModalOpen && (
        <PaymentCheckoutModal
          keycloak={keycloak}
          charge={paymentCharge}
          loading={paymentChargeLoading}
          fallbackTitle={event.title}
          fallbackSubtitle="Inscrição em evento"
          fallbackOrigin="eventos"
          onConfirmed={refreshConfirmedRegistration}
          onClose={() => setPaymentModalOpen(false)}
        />
      )}
    </div>
  );
}
