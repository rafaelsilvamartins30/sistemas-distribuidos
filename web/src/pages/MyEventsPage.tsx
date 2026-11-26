import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { ConfirmModal } from "../components/ConfirmModal";
import { Icon } from "../components/Icon";
import { SemesterSelector } from "../components/SemesterSelector";
import { UniversalAttendanceModal } from "../components/UniversalAttendanceModal";
import { useToast } from "../contexts/ToastContext";
import { isDateInSemester, useSemesterFilter } from "../hooks/useSemesterFilter";
import {
  AttendanceApiError,
  confirmOrganizerCheckIn,
  getOrganizerAttendanceAction,
  issueEventAttendanceQr,
  previewOrganizerCheckIn,
  reviewEventAttendance,
  type EventAttendanceReview,
  type OrganizerAttendanceAction,
  type OrganizerCheckInPreview,
  type QrArtifact,
} from "../services/attendance";
import {
  EventApiError,
  cancelEvent,
  createEvent,
  getEventOrganizerContexts,
  getManagedEvents,
  updateEvent,
  type AttendanceMode,
  type Event,
  type EventOrganizerContext,
  type RegistrationMode,
} from "../services/events";
import { extractErrorMessage } from "../utils/apiError.js";
import { formatBrl } from "../utils/currency.js";
import { organizerTypeLabel } from "../utils/eventPresentation";

type ManagedEventFilter = "upcoming" | "past" | "cancelled";

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

function managedStatusLabel(event: Event, nowMs: number): string {
  if (event.status === "CANCELLED") return "Evento cancelado";
  if (new Date(event.endsAt).getTime() < nowMs) return "Evento encerrado";
  return "Evento ativo";
}

export function MyEventsPage() {
  const { keycloak } = useOutletContext<{ keycloak: Keycloak }>();
  const toast = useToast();
  const [filter, setFilter] = useState<ManagedEventFilter>("upcoming");
  const [organizerContexts, setOrganizerContexts] = useState<EventOrganizerContext[]>([]);
  const [managedEvents, setManagedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadCount, setReloadCount] = useState(0);
  const { semesters, selectedTerm, selectedSemester, setSelectedTerm } = useSemesterFilter(keycloak.token ?? "");

  // Create form state
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

  // Edit form state
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

  // Cancel confirmation state
  const [cancellingEvent, setCancellingEvent] = useState<Event | null>(null);
  const [cancellingBusy, setCancellingBusy] = useState(false);

  // Organizer attendance modal state
  const [attendanceEvent, setAttendanceEvent] = useState<Event | null>(null);
  const [organizerAction, setOrganizerAction] = useState<OrganizerAttendanceAction | null>(null);
  const [organizerQr, setOrganizerQr] = useState<QrArtifact | null>(null);
  const [attendanceReview, setAttendanceReview] = useState<EventAttendanceReview | null>(null);
  const [attendanceReviewLoading, setAttendanceReviewLoading] = useState(false);
  const [organizerBusy, setOrganizerBusy] = useState(false);
  const [openingAttendanceId, setOpeningAttendanceId] = useState("");
  const [scannedTicketToken, setScannedTicketToken] = useState("");
  const [scannedTicket, setScannedTicket] = useState<OrganizerCheckInPreview | null>(null);
  const [scannerResetKey, setScannerResetKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    async function loadManaged() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token indisponível.");
        const contexts = (await getEventOrganizerContexts(keycloak.token)).items;
        const managed = contexts.length > 0 ? (await getManagedEvents(keycloak.token, 0, 100)).items : [];
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
      } catch (err) {
        if (active) {
          setOrganizerContexts([]);
          setManagedEvents([]);
          toast.error(extractErrorMessage(err, "Não foi possível carregar seus eventos administrados."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadManaged();
    return () => {
      active = false;
    };
  }, [keycloak, reloadCount, toast]);

  const nowMs = Date.now();
  const semesterEvents = useMemo(
    () => managedEvents.filter((item) => isDateInSemester(item.startsAt, selectedSemester)),
    [managedEvents, selectedSemester],
  );

  const buckets = useMemo(() => {
    const upcoming: Event[] = [];
    const past: Event[] = [];
    const cancelled: Event[] = [];
    for (const item of semesterEvents) {
      if (item.status === "CANCELLED") {
        cancelled.push(item);
      } else if (new Date(item.endsAt).getTime() >= nowMs) {
        upcoming.push(item);
      } else {
        past.push(item);
      }
    }
    upcoming.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    past.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
    cancelled.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
    return { upcoming, past, cancelled };
  }, [semesterEvents, nowMs]);

  const visibleEvents = buckets[filter];
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
      setFilter("upcoming");
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
    setCancellingBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");
      await cancelEvent(keycloak.token, targetEventId);
      if (editingEvent?.id === targetEventId) setEditingEvent(null);
      if (attendanceEvent?.id === targetEventId) setAttendanceEvent(null);
      setCancellingEvent(null);
      toast.success("Evento cancelado. Inscrições vinculadas foram canceladas e eventuais estornos solicitados.");
      setReloadCount((value) => value + 1);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível cancelar o evento."));
    } finally {
      setCancellingBusy(false);
    }
  }

  async function loadAttendanceReview(targetEventId: string, close = false) {
    if (close) setOrganizerBusy(true);
    else setAttendanceReviewLoading(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão indisponível.");
      const review = await reviewEventAttendance(keycloak.token, targetEventId, close);
      setAttendanceReview(review);
      if (close) {
        setOrganizerQr(null);
        setOrganizerAction("REVIEW_ATTENDANCE");
        toast.success("Lista de presença fechada.");
      }
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível consultar as presenças."));
    } finally {
      if (close) setOrganizerBusy(false);
      else setAttendanceReviewLoading(false);
    }
  }

  async function handleIssueEventQr(targetEventId: string) {
    setOrganizerBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      setOrganizerQr(await issueEventAttendanceQr(keycloak.token, targetEventId));
      toast.success("QR Code de presença liberado.");
    } catch (error) {
      const detail =
        error instanceof AttendanceApiError ? error.detail : extractErrorMessage(error, "Tente novamente mais tarde.");
      toast.error(`Não foi possível gerar o QR: ${detail}`);
    } finally {
      setOrganizerBusy(false);
    }
  }

  async function handleOpenAttendanceModal(item: Event) {
    setOpeningAttendanceId(item.id);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const result = await getOrganizerAttendanceAction(keycloak.token, item.id);
      if (!result.action) {
        if (item.createdByUserId && keycloak.subject && item.createdByUserId !== keycloak.subject) {
          toast.info("Apenas o criador registrado deste evento pode gerenciar o QR Code e a presença.");
        } else {
          toast.info(
            "O painel de QR Code e presença é liberado automaticamente assim que houver a primeira inscrição confirmada neste evento.",
          );
        }
        return;
      }
      setAttendanceEvent(item);
      setOrganizerAction(result.action);
      setOrganizerQr(null);
      setAttendanceReview(null);
      setScannedTicket(null);
      setScannedTicketToken("");
      setScannerResetKey(0);
      void loadAttendanceReview(item.id, false);
      if (result.action === "GENERATE_EVENT_QR") {
        void handleIssueEventQr(item.id);
      }
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível abrir o painel de presença."));
    } finally {
      setOpeningAttendanceId("");
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
    if (!scannedTicketToken || !attendanceEvent) return;
    setOrganizerBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      await confirmOrganizerCheckIn(keycloak.token, scannedTicketToken);
      setScannedTicket((current) => (current ? { ...current, status: "ATTENDED" } : current));
      toast.success("Presença do participante confirmada.");
      void loadAttendanceReview(attendanceEvent.id, false);
    } catch (error) {
      const detail =
        error instanceof AttendanceApiError ? error.detail : extractErrorMessage(error, "Tente novamente mais tarde.");
      toast.error(`Não foi possível confirmar a presença: ${detail}`);
    } finally {
      setOrganizerBusy(false);
    }
  }

  function handleResetScannedTicket() {
    setScannedTicket(null);
    setScannedTicketToken("");
    setScannerResetKey((current) => current + 1);
  }

  return (
    <div className="my-space-page">
      <header className="page-heading-row">
        <div className="page-intro product-page-intro">
          <p className="eyebrow">Administração de eventos</p>
          <h1>Meus eventos</h1>
          <p>Crie, edite, gerencie a presença por QR Code e acompanhe os eventos que você organiza.</p>
        </div>
        <div className="ticket-actions">
          {!loading && organizerContexts.length > 0 && (
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              + Novo evento
            </button>
          )}
          <Link className="button button-secondary" to="/eventos">
            <Icon name="calendar" width="16" height="16" /> Explorar eventos
          </Link>
        </div>
      </header>

      <section className="account-panel" aria-labelledby="my-events-title">
        <div className="account-panel-heading">
          <p className="eyebrow">Eventos administrados</p>
          <h2 id="my-events-title">Seus eventos</h2>
          <p>
            Eventos pagos criados por <strong>Professor, Departamento ou Unidade Acadêmica</strong> usam pagamento
            interno pela UNIR (Pix). Eventos pagos criados por <strong>Comunidade ou Entidade Acadêmica</strong> usam
            inscrição externa.
          </p>
        </div>

        <div className="semester-filter-row">
          <SemesterSelector
            id="my-events-semester"
            value={selectedTerm}
            semesters={semesters}
            onChange={(term) => setSelectedTerm(term)}
          />
        </div>

        <div className="registration-filters" role="group" aria-label="Filtrar eventos administrados">
          <button
            type="button"
            className={filter === "upcoming" ? "is-active" : ""}
            onClick={() => setFilter("upcoming")}
          >
            Próximos eventos ({buckets.upcoming.length})
          </button>
          <button type="button" className={filter === "past" ? "is-active" : ""} onClick={() => setFilter("past")}>
            Eventos anteriores ({buckets.past.length})
          </button>
          <button
            type="button"
            className={filter === "cancelled" ? "is-active" : ""}
            onClick={() => setFilter("cancelled")}
          >
            Cancelados ({buckets.cancelled.length})
          </button>
        </div>

        {loading ? (
          <p className="notice" role="status">
            Carregando seus eventos…
          </p>
        ) : organizerContexts.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhum perfil de organização vinculado</strong>
            <span>
              Apenas professores, departamentos, unidades acadêmicas, entidades, comunidades ou administradores podem
              criar e administrar eventos.
            </span>
            <Link className="button button-primary" to="/eventos">
              Ver programação
            </Link>
          </div>
        ) : visibleEvents.length > 0 ? (
          <div className="registration-list">
            {visibleEvents.map((item) => (
              <article className="registration-card" key={item.id}>
                <span className="registration-event-icon">
                  <Icon name="calendar" width="18" height="18" />
                </span>
                <div className="registration-card-copy">
                  <span
                    className={`registration-status ${item.status === "ACTIVE" && filter === "upcoming" ? "status-confirmada" : ""}`}
                  >
                    {managedStatusLabel(item, nowMs)}
                  </span>
                  <h3>
                    <Link to={`/eventos/${item.id}`}>{item.title}</Link>
                  </h3>
                  <p>
                    {dateTime(item.startsAt)} · {item.location}
                  </p>
                  <span>
                    {organizerTypeLabel(item.organizerType)} · {registrationModeLabel(item)} · {priceLabel(item)} ·
                    Inscrições até {dateTime(item.registrationDeadline)}
                  </span>
                  {item.status === "ACTIVE" && (
                    <div className="ticket-actions">
                      {item.attendanceEnabled && (
                        <button
                          className="button button-primary"
                          type="button"
                          disabled={openingAttendanceId === item.id}
                          onClick={() => void handleOpenAttendanceModal(item)}
                        >
                          {openingAttendanceId === item.id
                            ? "Abrindo…"
                            : item.attendanceMode === "ORGANIZER_SCANS_PARTICIPANT"
                              ? "Ler QR e lista de presença"
                              : "Presença e QR Code"}
                        </button>
                      )}
                      {item._links?.update && (
                        <button className="button button-secondary" type="button" onClick={() => startEditing(item)}>
                          Editar / Datas
                        </button>
                      )}
                      {item._links?.cancel && (
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => setCancellingEvent(item)}
                        >
                          Cancelar evento
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>
              {semesterEvents.length > 0
                ? "Nenhum evento nesta aba"
                : "Você ainda não administra eventos neste semestre"}
            </strong>
            <span>
              {semesterEvents.length > 0
                ? "Alterne entre próximos eventos, eventos anteriores e cancelados."
                : "Crie um novo evento para publicar na programação do campus."}
            </span>
            {organizerContexts.length > 0 && (
              <button className="button button-primary" type="button" onClick={() => setCreateOpen(true)}>
                + Novo evento
              </button>
            )}
          </div>
        )}
      </section>

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
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} required rows={3} />
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
                    <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
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
                            <option value="ORGANIZER_SCANS_PARTICIPANT">Organizador escaneia QR do participante</option>
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

      {cancellingEvent && (
        <ConfirmModal
          title="Deseja mesmo cancelar este evento?"
          description={`Ao cancelar “${cancellingEvent.title}”, esta ação não poderá ser desfeita. Todas as inscrições vinculadas serão canceladas e eventuais pagamentos Pix serão estornados automaticamente.`}
          confirmLabel="Sim, cancelar evento"
          busy={cancellingBusy}
          onConfirm={() => void handleCancelManagedEvent(cancellingEvent.id)}
          onClose={() => setCancellingEvent(null)}
        />
      )}

      {attendanceEvent && (
        <UniversalAttendanceModal
          mode="organizer"
          busy={organizerBusy}
          title={attendanceEvent.title}
          subtitle={`${attendanceEvent.location} · ${dateTime(attendanceEvent.startsAt)}`}
          token={organizerQr?.token ?? null}
          qrSvg={organizerQr?.qrSvg ?? null}
          organizerCanManageQr={organizerAction === "GENERATE_EVENT_QR"}
          organizerScanMode={organizerAction === "SCAN_PARTICIPANT_QR"}
          scannedTicket={scannedTicket}
          scannerResetKey={scannerResetKey}
          onPreviewParticipantQr={(code) => void handlePreviewOrganizerCheckIn(code)}
          onConfirmParticipantQr={() => void handleConfirmOrganizerCheckIn()}
          onResetScannedTicket={handleResetScannedTicket}
          attendanceReview={attendanceReview}
          attendanceListLoading={attendanceReviewLoading}
          canCloseAttendance={Boolean(organizerAction && !attendanceReview?.closedAt)}
          onRefreshAttendanceList={() => void loadAttendanceReview(attendanceEvent.id, false)}
          onCloseAttendanceList={() => void loadAttendanceReview(attendanceEvent.id, true)}
          onGenerateToken={() => void handleIssueEventQr(attendanceEvent.id)}
          onClose={() => setAttendanceEvent(null)}
        />
      )}
    </div>
  );
}
