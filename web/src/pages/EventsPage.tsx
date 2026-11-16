import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { EventCard } from "../components/EventCard";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/PageHeader";
import { SearchField } from "../components/SearchField";
import { Section } from "../components/Section";
import { useEventList } from "../hooks/useEventList";
import { EventApiError, getEvent, type Event } from "../services/events";
import {
  cancelRegistration,
  getMyRegistrations,
  registerForEvent,
  RegistrationApiError,
  type Registration,
} from "../services/registrations";

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
      return "Inscrição paga pela UNIR";
    case "EXTERNAL_PAID":
      return "Inscrição paga em plataforma externa";
  }
}

function priceLabel(event: Event): string {
  if (event.registrationMode === "INTERNAL_FREE") return "Gratuito";
  if (event.price == null) return "Valor a consultar";
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
  const { events, loading, error } = useEventList(keycloak);
  const [query, setQuery] = useState("");
  const visibleEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return events.filter((event) =>
      `${event.title} ${event.category} ${event.organizerType} ${event.description} ${event.location}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedQuery),
    );
  }, [events, query]);

  return (
    <div className="browse-page">
      <PageHeader
        eyebrow="A vida acontece junto"
        title="Eventos"
        description="Encontre atividades da universidade e saiba quem organiza, quando acontece e como participar."
      />

      <div className="page-search-toolbar" role="search" aria-label="Buscar eventos">
        <SearchField
          label="Buscar eventos"
          placeholder="Buscar por evento, tema ou entidade"
          value={query}
          onChange={setQuery}
        />
      </div>

      <Section title="Programação" description={loading ? "Carregando eventos…" : `${visibleEvents.length} eventos`}>
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
            <Icon name="search" />
            <strong>{events.length ? "Nenhum evento encontrado" : "Nenhum evento disponível"}</strong>
            <span>{events.length ? "Tente outro termo." : "Os próximos eventos aparecerão aqui."}</span>
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
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<"not-found" | "unavailable" | null>(null);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [registrationLoading, setRegistrationLoading] = useState(true);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadEvent() {
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token || !eventId) throw new Error("Evento indisponível.");
        const result = await getEvent(keycloak.token, eventId);
        if (active) setEvent(result);
        if (result.registrationMode === "INTERNAL_FREE") {
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
            {event.category} · {event.status === "ACTIVE" ? "Ativo" : "Cancelado"}
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
                <strong>{event.organizerType}</strong>
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
              <a href={event.externalUrl} target="_blank" rel="noreferrer">
                Informações da organização externa
              </a>
            </p>
          )}
          <section className="detail-copy-section">
            <h2>Presença</h2>
            <p>
              {event.attendanceEnabled
                ? `Validação habilitada${event.attendanceMode ? ` · ${event.attendanceMode}` : ""}.`
                : "Validação de presença não habilitada."}
            </p>
          </section>
        </article>
        <aside className="detail-aside-card">
          <section className="registration-action-panel" aria-labelledby="registration-action-title">
            <h2 id="registration-action-title">Minha inscrição</h2>
            {event.registrationMode !== "INTERNAL_FREE" ? (
              <p>Inscrições pagas não estão disponíveis nesta etapa.</p>
            ) : registrationLoading ? (
              <p role="status">Consultando sua inscrição…</p>
            ) : registration?.status === "CONFIRMED" ? (
              <>
                <p className="registration-confirmed" role="status">
                  Inscrição confirmada
                </p>
                <p>Confirmada em {dateTime(registration.confirmedAt ?? registration.registeredAt)}.</p>
                {canCancel(registration) ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={registrationBusy}
                    onClick={() => void handleCancel()}
                  >
                    {registrationBusy ? "Cancelando…" : "Cancelar inscrição"}
                  </button>
                ) : (
                  <p>O prazo para cancelamento (24 horas antes do evento) terminou.</p>
                )}
              </>
            ) : (
              <>
                {registration?.status === "CANCELLED_BY_USER" && (
                  <p role="status">Sua inscrição anterior foi cancelada.</p>
                )}
                <p>Inscreva-se gratuitamente usando sua conta UNIR.</p>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={registrationBusy || event.status !== "ACTIVE"}
                  onClick={() => void handleRegister()}
                >
                  {registrationBusy ? "Inscrevendo…" : "Inscrever-se gratuitamente"}
                </button>
              </>
            )}
            {registrationError && (
              <p className="notice notice-error" role="alert">
                {registrationError}
              </p>
            )}
          </section>
          <span className="eyebrow">Evento</span>
          <p>Identificador do evento</p>
          <code>{event.id}</code>
          <p>Organizador: {event.organizerId}</p>
        </aside>
      </div>
    </div>
  );
}
