import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import { ParticipantQrScanner } from "../components/ParticipantQrScanner";
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

function canCancel(ticket: TicketRegistration): boolean {
  return ticket.status === "CONFIRMED" && Date.now() <= new Date(ticket.event.startsAt).getTime() - 24 * 60 * 60 * 1000;
}

function toTicketPage(value: TicketPage, ticket: TicketRegistration, attendance: MyTicket): TicketPage {
  return {
    ...value,
    items: value.items.map((item) => (item.id === ticket.id ? { ...item, attendance } : item)),
  };
}

function qrDataUri(qr: QrArtifact): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.qrSvg)}`;
}

export function MySpacePage() {
  const { keycloak } = useOutletContext<{ keycloak: Keycloak }>();
  const [filter, setFilter] = useState<TicketFilter>("upcoming");
  const [page, setPage] = useState<TicketPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [busyId, setBusyId] = useState("");
  const [scannerId, setScannerId] = useState("");
  const [qr, setQr] = useState<{ registrationId: string; value: QrArtifact } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadTickets() {
      setLoading(true);
      setFailure("");
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const result = await getMyTickets(keycloak.token);
        if (active) setPage(result);
      } catch {
        if (active) setFailure("Não foi possível carregar seus tickets. Tente novamente mais tarde.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadTickets();
    return () => {
      active = false;
    };
  }, [keycloak]);

  const visibleTickets = useMemo(() => {
    const now = Date.now();
    return (page?.items ?? [])
      .filter((ticket) =>
        filter === "past"
          ? new Date(ticket.event.endsAt).getTime() < now
          : new Date(ticket.event.endsAt).getTime() >= now,
      )
      .sort((left, right) =>
        filter === "past"
          ? new Date(right.event.startsAt).getTime() - new Date(left.event.startsAt).getTime()
          : new Date(left.event.startsAt).getTime() - new Date(right.event.startsAt).getTime(),
      );
  }, [filter, page]);

  async function cancel(ticket: TicketRegistration) {
    setBusyId(ticket.id);
    setFailure("");
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
                      attendance: item.attendance ? { ...item.attendance, status: "CANCELLED" } : null,
                    }
                  : item,
              ),
            }
          : current,
      );
    } catch (error) {
      setFailure(
        error instanceof RegistrationApiError && error.detail === "CANCELLATION_WINDOW_CLOSED"
          ? "O prazo para cancelar esta inscrição terminou."
          : "Não foi possível cancelar o ticket. Tente novamente.",
      );
    } finally {
      setBusyId("");
    }
  }

  async function scanEventQr(ticket: TicketRegistration, token: string) {
    setBusyId(ticket.id);
    setFailure("");
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const result = await checkInWithEventQr(keycloak.token, token);
      if (ticket.attendance) {
        const attendance = { ...ticket.attendance, status: "ATTENDED" as const, checkedAt: result.checkedAt };
        setPage((current) => (current ? toTicketPage(current, ticket, attendance) : current));
      }
      setScannerId("");
    } catch (error) {
      setFailure(
        error instanceof AttendanceApiError
          ? `Não foi possível registrar a presença: ${error.detail}.`
          : "Não foi possível registrar a presença. Tente novamente.",
      );
    } finally {
      setBusyId("");
    }
  }

  async function openMyQr(ticket: TicketRegistration) {
    setBusyId(ticket.id);
    setFailure("");
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const issued = await issueMyTicketQr(keycloak.token, ticket.eventId);
      setQr({ registrationId: ticket.id, value: issued });
    } catch (error) {
      setFailure(
        error instanceof AttendanceApiError
          ? `Não foi possível abrir seu QR: ${error.detail}.`
          : "Não foi possível abrir seu QR. Tente novamente.",
      );
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
        <div className="registration-filters" role="group" aria-label="Filtrar tickets">
          <button
            type="button"
            className={filter === "upcoming" ? "is-active" : ""}
            onClick={() => setFilter("upcoming")}
          >
            Próximos eventos
          </button>
          <button type="button" className={filter === "past" ? "is-active" : ""} onClick={() => setFilter("past")}>
            Eventos anteriores
          </button>
        </div>

        {loading ? (
          <p className="notice" role="status">
            Carregando seus tickets…
          </p>
        ) : failure && !page ? (
          <p className="notice notice-error" role="alert">
            {failure}
          </p>
        ) : (
          <>
            {failure && (
              <p className="notice notice-error" role="alert">
                {failure}
              </p>
            )}
            {visibleTickets.length ? (
              <div className="registration-list">
                {visibleTickets.map((ticket) => {
                  const attendance = ticket.attendance;
                  const upcoming = new Date(ticket.event.endsAt).getTime() >= Date.now();
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
                        {confirmed &&
                          ticket.event.attendanceEnabled &&
                          upcoming &&
                          attendance?.status === "ELIGIBLE" && (
                            <div className="ticket-actions">
                              {attendance.mode === "PARTICIPANT_SCANS_EVENT" ? (
                                <>
                                  <p>
                                    Leia o QR exibido pela organização durante o evento para registrar sua presença.
                                  </p>
                                  <button
                                    className="button button-secondary"
                                    type="button"
                                    disabled={busyId === ticket.id}
                                    onClick={() => setScannerId(scannerId === ticket.id ? "" : ticket.id)}
                                  >
                                    {scannerId === ticket.id ? "Fechar leitor" : "Ler QR do evento"}
                                  </button>
                                  {scannerId === ticket.id && (
                                    <ParticipantQrScanner
                                      busy={busyId === ticket.id}
                                      autoSubmitOnScan
                                      onToken={(value) => void scanEventQr(ticket, value)}
                                    />
                                  )}
                                </>
                              ) : (
                                <>
                                  <button
                                    className="button button-secondary"
                                    type="button"
                                    disabled={busyId === ticket.id}
                                    onClick={() => void openMyQr(ticket)}
                                  >
                                    {busyId === ticket.id ? "Gerando QR…" : "Abrir meu QR"}
                                  </button>
                                  {qr?.registrationId === ticket.id && (
                                    <div className="my-ticket-qr">
                                      <img src={qrDataUri(qr.value)} alt={`QR do ticket para ${ticket.event.title}`} />
                                      <span>Apresente este QR ao organizador na entrada.</span>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        {confirmed && ticket.event.attendanceEnabled && !attendance && upcoming && (
                          <p className="notice" role="status">
                            Seu ticket está sendo sincronizado…
                          </p>
                        )}
                        {confirmed && !ticket.event.attendanceEnabled && upcoming && (
                          <p>Este evento não habilitou controle de presença pelo Access.</p>
                        )}
                      </div>
                      <div className="registration-card-actions">
                        <Link className="button button-secondary" to={`/eventos/${ticket.event.id}`}>
                          Ver evento
                        </Link>
                        {upcoming && canCancel(ticket) && (
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
      </section>
    </div>
  );
}
