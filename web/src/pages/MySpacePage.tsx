import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import {
  cancelRegistration,
  getMyRegistrations,
  RegistrationApiError,
  type Registration,
  type RegistrationStatus,
} from "../services/registrations";
type RegistrationFilter = "Todas" | "Confirmadas" | "Canceladas";

function statusLabel(status: RegistrationStatus): string {
  switch (status) {
    case "CONFIRMED":
      return "Confirmada";
    case "PENDING_PAYMENT":
      return "Pendente de pagamento";
    case "CANCELLED_BY_USER":
      return "Cancelada por você";
    case "CANCELLED_BY_EVENT":
      return "Evento cancelado";
    case "PAYMENT_FAILED":
      return "Pagamento não concluído";
    case "PAYMENT_EXPIRED":
      return "Inscrição expirada";
  }
}

function canCancel(registration: Registration): boolean {
  return Date.now() <= new Date(registration.event.startsAt).getTime() - 24 * 60 * 60 * 1000;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function registrationErrorMessage(error: unknown): string {
  if (error instanceof RegistrationApiError && error.detail === "CANCELLATION_WINDOW_CLOSED") {
    return "O prazo para cancelar esta inscrição terminou.";
  }
  if (error instanceof RegistrationApiError) return `Não foi possível cancelar a inscrição (${error.status}).`;
  return "Não foi possível concluir o cancelamento. Tente novamente.";
}

export function MySpacePage() {
  const { keycloak } = useOutletContext<{ keycloak: Keycloak }>();
  const [filter, setFilter] = useState<RegistrationFilter>("Todas");
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(true);
  const [registrationsError, setRegistrationsError] = useState("");
  const [busyRegistration, setBusyRegistration] = useState("");

  useEffect(() => {
    let active = true;
    async function loadRegistrations() {
      setRegistrationsLoading(true);
      setRegistrationsError("");
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token de acesso indisponível.");
        const result = await getMyRegistrations(keycloak.token);
        if (active) setRegistrations(result.items);
      } catch {
        if (active) setRegistrationsError("Não foi possível carregar suas inscrições. Tente novamente mais tarde.");
      } finally {
        if (active) setRegistrationsLoading(false);
      }
    }
    void loadRegistrations();
    return () => {
      active = false;
    };
  }, [keycloak]);

  async function cancel(registration: Registration) {
    setBusyRegistration(registration.id);
    setRegistrationsError("");
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");
      const updated = await cancelRegistration(keycloak.token, registration.id);
      setRegistrations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setRegistrationsError(registrationErrorMessage(error));
    } finally {
      setBusyRegistration("");
    }
  }

  const visibleRegistrations = registrations.filter((registration) => {
    if (filter === "Confirmadas") return registration.status === "CONFIRMED";
    if (filter === "Canceladas") return registration.status.startsWith("CANCELLED_");
    return true;
  });

  return (
    <div className="my-space-page">
      <header className="page-heading-row">
        <div className="page-intro product-page-intro">
          <p className="eyebrow">Agenda pessoal</p>
          <h1>Minhas inscrições</h1>
          <p>Acompanhe suas inscrições e gerencie sua presença nos eventos do Campus.</p>
        </div>
        <Link className="button button-secondary" to="/eventos">
          <Icon name="calendar" width="16" height="16" /> Explorar eventos
        </Link>
      </header>

      <section className="account-panel" aria-labelledby="my-space-registrations-title">
        <div className="account-panel-heading">
          <p className="eyebrow">Eventos</p>
          <h2 id="my-space-registrations-title">Sua agenda</h2>
          <p>Consulte o estado atual das inscrições de eventos retornadas pelo Engagement.</p>
        </div>
        <div className="registration-filters" role="group" aria-label="Filtrar inscrições">
          {(["Todas", "Confirmadas", "Canceladas"] as RegistrationFilter[]).map((item) => (
            <button
              key={item}
              type="button"
              className={filter === item ? "is-active" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {registrationsLoading ? (
          <p className="notice" role="status">
            Carregando inscrições…
          </p>
        ) : registrationsError ? (
          <p className="notice notice-error" role="alert">
            {registrationsError}
          </p>
        ) : visibleRegistrations.length ? (
          <div className="registration-list">
            {visibleRegistrations.map((registration) => (
              <article className="registration-card" key={registration.id}>
                <span className="registration-event-icon">
                  <Icon name="calendar" width="18" height="18" />
                </span>
                <div className="registration-card-copy">
                  <span
                    className={`registration-status ${registration.status === "CONFIRMED" ? "status-confirmada" : ""}`}
                  >
                    {statusLabel(registration.status)}
                  </span>
                  <h3>
                    <Link to={`/eventos/${registration.event.id}`}>{registration.event.title}</Link>
                  </h3>
                  <p>
                    {dateTime(registration.event.startsAt)} · {registration.event.location}
                  </p>
                  <span>Inscrição em {dateTime(registration.registeredAt)}</span>
                </div>
                <div className="registration-card-actions">
                  <Link className="button button-secondary" to={`/eventos/${registration.event.id}`}>
                    Ver evento
                  </Link>
                  {canCancel(registration) && (
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={busyRegistration === registration.id}
                      onClick={() => void cancel(registration)}
                    >
                      {busyRegistration === registration.id ? "Cancelando…" : "Cancelar inscrição"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>{registrations.length ? "Nenhuma inscrição neste filtro" : "Você ainda não tem inscrições"}</strong>
            <span>
              {registrations.length
                ? "Escolha outro filtro para ver suas inscrições."
                : "Quando você se inscrever em um evento, ele aparecerá aqui."}
            </span>
            {!registrations.length && (
              <Link className="button button-primary" to="/eventos">
                Explorar eventos
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
