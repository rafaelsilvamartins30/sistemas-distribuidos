import { formatBrl } from "../utils/currency.js";
import { RegistrationRefundPolicy } from "../components/RegistrationRefundPolicy";
import { RegistrationPaymentNotice } from "../components/RegistrationPaymentNotice";
import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { ConfirmModal } from "../components/ConfirmModal";
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
  getEvent,
  getEventOrganizerContexts,
  getEvents,
  type Event,
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
  const [eventQuery, setEventQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [followedOnly, setFollowedOnly] = useState(false);
  const [followedOrganizerKeys, setFollowedOrganizerKeys] = useState<Set<string>>(new Set());
  const [followedProfilesReady, setFollowedProfilesReady] = useState(false);
  const [canManageEvents, setCanManageEvents] = useState(false);

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
  }, [keycloak, toast]);

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

  useEffect(() => {
    let active = true;
    async function loadOrganizerPermission() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) return;
        const contexts = (await getEventOrganizerContexts(keycloak.token)).items;
        if (active) setCanManageEvents(contexts.length > 0);
      } catch {
        if (active) setCanManageEvents(false);
      }
    }
    void loadOrganizerPermission();
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

  return (
    <div className="browse-page events-page">
      <div className="events-page-heading">
        <PageHeader
          eyebrow="Programação do Campus"
          title="Eventos & encontros universitários"
          description="Encontros, atividades e inscrições da comunidade universitária."
        />
        <div className="ticket-actions">
          {canManageEvents && (
            <Link className="button button-primary" to="/meus-eventos">
              <Icon name="calendar" width="16" height="16" /> Meus eventos
            </Link>
          )}
          <Link className="button button-secondary" to="/tickets">
            <Icon name="calendar" width="16" height="16" /> Meus tickets
          </Link>
        </div>
      </div>

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
    checkInOpensAt?: string | null;
    checkInClosesAt?: string | null;
  } | null>(null);
  const organizerAction = organizerPermission?.eventId === eventId ? organizerPermission?.action : null;
  const [organizerPermissionRefreshing, setOrganizerPermissionRefreshing] = useState(false);
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
  const [scannerResetKey, setScannerResetKey] = useState(0);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentCharge, setPaymentCharge] = useState<PaymentCharge | null>(null);
  const [paymentChargeLoading, setPaymentChargeLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"cancel-registration" | "cancel-event" | null>(null);

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
          if (active) {
            setOrganizerPermission({
              eventId: event.id,
              action: result.action,
              checkInOpensAt: result.checkInOpensAt ?? null,
              checkInClosesAt: result.checkInClosesAt ?? null,
            });
          }
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
      setConfirmAction(null);
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
      setConfirmAction(null);
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
      if (close) {
        setOrganizerQr(null);
        setOrganizerPermission({ eventId: event.id, action: "REVIEW_ATTENDANCE" });
        toast.success("Lista de presença fechada.");
      }
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

  async function handleRefreshOrganizerAction() {
    if (!event) return;
    setOrganizerPermissionRefreshing(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) return;
      const result = await getOrganizerAttendanceAction(keycloak.token, event.id);
      setOrganizerPermission({
        eventId: event.id,
        action: result.action,
        checkInOpensAt: result.checkInOpensAt ?? null,
        checkInClosesAt: result.checkInClosesAt ?? null,
      });
      if (!result.action) {
        toast.info("Ainda não há sessão de presença ativa. Aguarde a primeira inscrição confirmada.");
      }
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível consultar o painel de presença."));
    } finally {
      setOrganizerPermissionRefreshing(false);
    }
  }

  function handleResetScannedTicket() {
    setScannedTicket(null);
    setScannedTicketToken("");
    setScannerResetKey((current) => current + 1);
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
                onClick={() => setConfirmAction("cancel-event")}
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
                    onClick={() => setConfirmAction("cancel-registration")}
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
                    Leia o QR compartilhado ou informe o código do evento para registrar sua presença enquanto a lista
                    estiver aberta.
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
                <>
                  <p>
                    Gere e apresente seu QR individual ao organizador na entrada do evento enquanto a lista estiver
                    aberta.
                  </p>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={attendanceBusy}
                    onClick={() => void handleIssueParticipantQr()}
                  >
                    Abrir meu QR de entrada
                  </button>
                </>
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
          {(organizerAction ||
            (event.viewerCanManage === true && event.attendanceEnabled && event.status === "ACTIVE")) && (
            <section
              className="registration-action-panel attendance-action-panel"
              aria-labelledby="organizer-attendance-title"
            >
              <h2 id="organizer-attendance-title">Organização do evento</h2>
              {organizerAction ? (
                <>
                  <p>
                    {organizerAction === "REVIEW_ATTENDANCE"
                      ? "A lista de presença deste evento está fechada. Consulte ou copie os presentes."
                      : organizerAction === "GENERATE_EVENT_QR"
                        ? "Gere o QR Code de presença, acompanhe em tempo real e feche a lista quando encerrar o credenciamento."
                        : "Valide os tickets QR dos participantes na entrada, acompanhe a lista e feche quando encerrar."}
                  </p>
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={organizerBusy}
                    onClick={handleOpenOrganizerAttendance}
                  >
                    {organizerAction === "SCAN_PARTICIPANT_QR" ? "Ler QR e lista de presença" : "Presença e QR Code"}
                  </button>
                </>
              ) : (
                <>
                  <p>
                    {event.createdByUserId && keycloak.subject && event.createdByUserId !== keycloak.subject
                      ? "Apenas o criador registrado deste evento pode gerenciar o QR Code e a validação de presença."
                      : "O painel de QR Code e lista de presença é liberado automaticamente assim que houver a primeira inscrição confirmada neste evento."}
                  </p>
                  {(!event.createdByUserId || event.createdByUserId === keycloak.subject) && (
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={organizerPermissionRefreshing}
                      onClick={() => void handleRefreshOrganizerAction()}
                    >
                      {organizerPermissionRefreshing ? "Verificando…" : "Verificar painel de presença"}
                    </button>
                  )}
                </>
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
          scannerResetKey={scannerResetKey}
          onPreviewParticipantQr={(code) => void handlePreviewOrganizerCheckIn(code)}
          onConfirmParticipantQr={() => void handleConfirmOrganizerCheckIn()}
          onResetScannedTicket={handleResetScannedTicket}
          attendanceReview={attendanceReview}
          attendanceListLoading={attendanceReviewLoading}
          canCloseAttendance={Boolean(organizerAction && !attendanceReview?.closedAt)}
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

      {confirmAction === "cancel-registration" && (
        <ConfirmModal
          title="Deseja mesmo cancelar sua inscrição?"
          description={`Você perderá sua vaga confirmada em “${event.title}”. Caso queira voltar depois, será necessário fazer uma nova inscrição se ainda houver vagas.`}
          confirmLabel="Sim, cancelar inscrição"
          busy={registrationBusy}
          onConfirm={() => void handleCancel()}
          onClose={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === "cancel-event" && (
        <ConfirmModal
          title="Deseja mesmo cancelar este evento?"
          description={`Ao cancelar “${event.title}”, esta ação não poderá ser desfeita. Todas as inscrições vinculadas serão canceladas e eventuais pagamentos Pix serão estornados automaticamente.`}
          confirmLabel="Sim, cancelar evento"
          busy={registrationBusy}
          onConfirm={() => void handleCancelEventByOrganizer()}
          onClose={() => setConfirmAction(null)}
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
