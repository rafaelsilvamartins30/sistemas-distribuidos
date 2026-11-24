import { RegistrationRefundPolicy } from "../components/RegistrationRefundPolicy";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import { SemesterSelector } from "../components/SemesterSelector";
import { UniversalAttendanceModal } from "../components/UniversalAttendanceModal";
import { useToast } from "../contexts/ToastContext";
import {
  AttendanceApiError,
  checkInWithEventQr,
  getMyTickets,
  issueMyTicketQr,
  type MyTicket,
  type QrArtifact,
  type TicketPage,
  type TicketRegistration,
} from "../services/attendance";
import { cancelRegistration, RegistrationApiError } from "../services/registrations";
import { useSemesterFilter } from "../hooks/useSemesterFilter";
import { extractErrorMessage } from "../utils/apiError.js";

type TicketFilter = "upcoming" | "past";

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(ticket: TicketRegistration): string {
  if (ticket.status.startsWith("CANCELLED_")) return "Inscrição cancelada";
  switch (ticket.attendance?.status) {
    case "ATTENDED":
      return "Presença confirmada";
    case "NO_SHOW":
      return "Ausente";
    case "CANCELLED":
      return "Ticket cancelado";
    case "ELIGIBLE":
      return "Ticket confirmado";
    default:
      switch (ticket.status) {
        case "PENDING_PAYMENT":
          return "Pagamento pendente";
        case "PAYMENT_FAILED":
          return "Pagamento não concluído";
        case "PAYMENT_EXPIRED":
          return "Prazo de pagamento encerrado";
        default:
          return "Inscrição confirmada";
      }
  }
}

function toTicketPage(value: TicketPage, ticket: TicketRegistration, attendance: MyTicket): TicketPage {
  return {
    ...value,
    items: value.items.map((item) => (item.id === ticket.id ? { ...item, attendance } : item)),
  };
}

export function MySpacePage() {
  const { keycloak } = useOutletContext<{ keycloak: Keycloak }>();
  const toast = useToast();
  const [filter, setFilter] = useState<TicketFilter>("upcoming");
  const [pageNumber, setPageNumber] = useState(0);
  const [page, setPage] = useState<TicketPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const { semesters, selectedTerm, selectedSemester, setSelectedTerm } = useSemesterFilter(keycloak.token ?? "");
  const [attendanceModal, setAttendanceModal] = useState<{
    ticket: TicketRegistration;
    mode: "participant" | "participant-ticket";
    qr?: QrArtifact | null;
    feedback?: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadTickets() {
      setLoading(true);
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const result = await getMyTickets(keycloak.token, {
          page: pageNumber,
          agenda: filter,
          startOn: selectedSemester?.startOn,
          endOn: selectedSemester?.endOn,
        });
        if (active) setPage(result);
      } catch (err) {
        if (active) toast.error(extractErrorMessage(err, "Não foi possível carregar seus tickets."));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadTickets();
    return () => {
      active = false;
    };
  }, [keycloak, filter, pageNumber, selectedSemester, toast]);

  const visibleTickets = page?.items ?? [];

  async function cancel(ticket: TicketRegistration) {
    setBusyId(ticket.id);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const updated = await cancelRegistration(keycloak.token, ticket.id);
      setPage((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id
                  ? {
                      ...item,
                      status: updated.status,
                      cancelledAt: updated.cancelledAt,
                      canCancel: updated.canCancel,
                      cancellationBlockedReason: updated.cancellationBlockedReason,
                    }
                  : item,
              ),
            }
          : current,
      );
      toast.success("Inscrição cancelada.");
    } catch (error) {
      toast.error(
        error instanceof RegistrationApiError && error.detail === "CANCELLATION_WINDOW_CLOSED"
          ? "O prazo para cancelar esta inscrição terminou."
          : error instanceof RegistrationApiError && error.detail === "ONLY_FREE_REGISTRATIONS_CAN_BE_CANCELLED"
            ? "Inscrições pagas não podem ser canceladas pelo participante."
            : extractErrorMessage(error, "Não foi possível cancelar o ticket. Tente novamente."),
      );
    } finally {
      setBusyId("");
    }
  }

  async function scanEventQr(ticket: TicketRegistration, token: string) {
    setBusyId(ticket.id);
    setAttendanceModal((prev) => (prev ? { ...prev, feedback: null } : prev));
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const result = await checkInWithEventQr(keycloak.token, token);
      if (ticket.attendance) {
        const attendance = { ...ticket.attendance, status: result.status, action: null, checkedAt: result.checkedAt };
        setPage((current) => (current ? toTicketPage(current, ticket, attendance) : current));
      }
      setAttendanceModal(null);
      toast.success("Presença confirmada com sucesso!");
    } catch (error) {
      const message =
        error instanceof AttendanceApiError
          ? `Não foi possível registrar a presença: ${error.detail}.`
          : extractErrorMessage(error, "Não foi possível registrar a presença. Tente novamente.");
      toast.error(message);
    } finally {
      setBusyId("");
    }
  }

  async function openMyQr(ticket: TicketRegistration) {
    setBusyId(ticket.id);
    setAttendanceModal({ ticket, mode: "participant-ticket", qr: null, feedback: null });
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const issued = await issueMyTicketQr(keycloak.token, ticket.eventId);
      setAttendanceModal({
        ticket,
        mode: "participant-ticket",
        qr: issued,
        feedback: "Apresente este QR ou código ao organizador na entrada do evento.",
      });
    } catch (error) {
      const message =
        error instanceof AttendanceApiError
          ? `Não foi possível abrir seu QR: ${error.detail}.`
          : extractErrorMessage(error, "Não foi possível abrir seu QR. Tente novamente.");
      toast.error(message);
      setAttendanceModal(null);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="my-space-page">
      <header className="page-heading-row">
        <div className="page-intro product-page-intro">
          <p className="eyebrow">Agenda pessoal</p>
          <h1>Meus tickets</h1>
          <p>Consulte suas inscrições, acesse os tickets e acompanhe o histórico de presença.</p>
        </div>
        <Link className="button button-secondary" to="/eventos">
          <Icon name="calendar" width="16" height="16" /> Explorar eventos
        </Link>
      </header>

      <section className="account-panel" aria-labelledby="my-space-tickets-title">
        <div className="account-panel-heading">
          <p className="eyebrow">Eventos</p>
          <h2 id="my-space-tickets-title">Sua agenda</h2>
          <p>Eventos futuros e anteriores, com o estado atual da inscrição e da presença.</p>
        </div>
        <div className="semester-filter-row">
          <SemesterSelector
            id="my-tickets-semester"
            value={selectedTerm}
            semesters={semesters}
            onChange={(term) => {
              setPageNumber(0);
              setSelectedTerm(term);
            }}
          />
        </div>
        <div className="registration-filters" role="group" aria-label="Filtrar tickets">
          <button
            type="button"
            className={filter === "upcoming" ? "is-active" : ""}
            onClick={() => {
              setPageNumber(0);
              setFilter("upcoming");
            }}
          >
            Próximos eventos
          </button>
          <button
            type="button"
            className={filter === "past" ? "is-active" : ""}
            onClick={() => {
              setPageNumber(0);
              setFilter("past");
            }}
          >
            Eventos anteriores
          </button>
        </div>

        {loading ? (
          <p className="notice" role="status">
            Carregando seus tickets…
          </p>
        ) : (
          <>
            {visibleTickets.length ? (
              <div className="registration-list">
                {visibleTickets.map((ticket) => {
                  const attendance = ticket.attendance;
                  const upcoming = filter === "upcoming";
                  const confirmed = ticket.status === "CONFIRMED";
                  return (
                    <article className="registration-card" key={ticket.id}>
                      <span className="registration-event-icon">
                        <Icon name="calendar" width="18" height="18" />
                      </span>
                      <div className="registration-card-copy">
                        <span
                          className={`registration-status ${attendance?.status === "ATTENDED" ? "status-confirmada" : ""}`}
                        >
                          {statusLabel(ticket)}
                        </span>
                        <h3>
                          <Link to={`/eventos/${ticket.event.id}`}>{ticket.event.title}</Link>
                        </h3>
                        <p>
                          {dateTime(ticket.event.startsAt)} · {ticket.event.location}
                        </p>
                        {attendance?.checkedAt && <span>Presença em {dateTime(attendance.checkedAt)}</span>}
                        {ticket.status.startsWith("CANCELLED_") && ticket.cancelledAt && (
                          <span>Cancelado em {dateTime(ticket.cancelledAt)}</span>
                        )}
                        {attendance?.action && (
                          <div className="ticket-actions">
                            {attendance.action === "SCAN_EVENT_QR" ? (
                              <button
                                className="button button-primary"
                                type="button"
                                disabled={busyId === ticket.id}
                                onClick={() =>
                                  setAttendanceModal({
                                    ticket,
                                    mode: "participant",
                                    qr: null,
                                    feedback: null,
                                  })
                                }
                              >
                                Confirmar Presença
                              </button>
                            ) : (
                              <button
                                className="button button-primary"
                                type="button"
                                disabled={busyId === ticket.id}
                                onClick={() => void openMyQr(ticket)}
                              >
                                {busyId === ticket.id ? "Gerando QR…" : "Abrir meu QR de entrada"}
                              </button>
                            )}
                          </div>
                        )}
                        {confirmed && ticket.event.attendanceEnabled && !attendance && upcoming && (
                          <p className="notice" role="status">
                            Seu ticket está sendo sincronizado…
                          </p>
                        )}
                        {upcoming &&
                          ticket.cancellationBlockedReason === "ONLY_FREE_REGISTRATIONS_CAN_BE_CANCELLED" && (
                            <RegistrationRefundPolicy origin="eventos" />
                          )}
                        {upcoming && ticket.cancellationBlockedReason === "CANCELLATION_WINDOW_CLOSED" && (
                          <p>O prazo para cancelamento (24 horas antes do evento) terminou.</p>
                        )}
                        {confirmed && !ticket.event.attendanceEnabled && upcoming && (
                          <p>Este evento não habilitou controle de presença pelo Access.</p>
                        )}
                      </div>
                      <div className="registration-card-actions">
                        <Link className="button button-secondary" to={`/eventos/${ticket.event.id}`}>
                          Ver evento
                        </Link>
                        {ticket.canCancel && (
                          <button
                            className="button button-secondary"
                            type="button"
                            disabled={busyId === ticket.id}
                            onClick={() => void cancel(ticket)}
                          >
                            {busyId === ticket.id ? "Cancelando…" : "Cancelar inscrição"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <strong>{page?.items.length ? "Nenhum evento neste período" : "Você ainda não tem tickets"}</strong>
                <span>
                  {page?.items.length
                    ? "Alterne entre próximos eventos e eventos anteriores."
                    : "Suas inscrições confirmadas aparecerão aqui."}
                </span>
                {!page?.items.length && (
                  <Link className="button button-primary" to="/eventos">
                    Explorar eventos
                  </Link>
                )}
              </div>
            )}
          </>
        )}
        {!loading && page && page.totalPages > 1 && (
          <div className="registration-card-actions" aria-label="Paginação de tickets">
            <button
              className="button button-secondary"
              type="button"
              disabled={pageNumber === 0}
              onClick={() => setPageNumber((current) => current - 1)}
            >
              Anterior
            </button>
            <span>
              Página {pageNumber + 1} de {page.totalPages}
            </span>
            <button
              className="button button-secondary"
              type="button"
              disabled={pageNumber + 1 >= page.totalPages}
              onClick={() => setPageNumber((current) => current + 1)}
            >
              Próxima
            </button>
          </div>
        )}
      </section>

      {attendanceModal && (
        <UniversalAttendanceModal
          mode={attendanceModal.mode}
          busy={busyId === attendanceModal.ticket.id}
          title={attendanceModal.mode === "participant" ? "Confirmar Presença no Evento" : "Meu Ticket QR de Entrada"}
          subtitle={`${attendanceModal.ticket.event.title} · ${dateTime(attendanceModal.ticket.event.startsAt)}`}
          token={attendanceModal.qr?.token ?? null}
          qrSvg={attendanceModal.qr?.qrSvg ?? null}
          checkedIn={attendanceModal.ticket.attendance?.status === "ATTENDED"}
          feedback={attendanceModal.feedback}
          onSubmitToken={
            attendanceModal.mode === "participant"
              ? (code) => void scanEventQr(attendanceModal.ticket, code)
              : undefined
          }
          onGenerateToken={
            attendanceModal.mode === "participant-ticket" ? () => void openMyQr(attendanceModal.ticket) : undefined
          }
          onClose={() => setAttendanceModal(null)}
        />
      )}
    </div>
  );
}
