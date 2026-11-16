import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import {
  events,
  findSpace,
  mockCurrentUser,
  mockFollowedSpaceIds,
  mockNotifications,
  mockRegistrations,
  spaces,
  type Entity,
  spacePath,
} from "../data/demoContent";
import {
  cancelRegistration,
  getMyRegistrations,
  RegistrationApiError,
  type Registration,
  type RegistrationStatus,
} from "../services/registrations";

const sections = ["Dados da conta", "Preferências", "Notificações", "Inscrições", "Acessos e QR"] as const;
type Section = (typeof sections)[number];
const statuses = ["Todas", "Confirmadas", "Canceladas"] as const;
type RegistrationFilter = (typeof statuses)[number];

function registrationStatusLabel(status: RegistrationStatus): string {
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

function registrationDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function registrationCanBeCancelled(registration: Registration): boolean {
  return Date.now() <= new Date(registration.event.startsAt).getTime() - 24 * 60 * 60 * 1000;
}

export function MySpacePage({ initialSection = "Dados da conta" }: { initialSection?: Section }) {
  const { keycloak } = useOutletContext<{ keycloak: Keycloak }>();
  const [section, setSection] = useState<Section>(initialSection);
  const [notifications, setNotifications] = useState(mockNotifications.map((item) => ({ ...item })));
  const [interests, setInterests] = useState(mockCurrentUser.interests.join("\n"));
  const [statusFilter, setStatusFilter] = useState<RegistrationFilter>("Todas");
  const [myRegistrations, setMyRegistrations] = useState<Registration[]>([]);
  const [registrationsLoaded, setRegistrationsLoaded] = useState(false);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);
  const [registrationsError, setRegistrationsError] = useState<string | null>(null);
  const [registrationBusy, setRegistrationBusy] = useState<string | null>(null);
  const [qrEventId, setQrEventId] = useState<string | null>(null);
  const followedSpaces = mockFollowedSpaceIds.map(findSpace).filter((space): space is Entity => Boolean(space));
  const qrRegistration = mockRegistrations.find((registration) => registration.eventId === qrEventId);
  const qrEvent = events.find((event) => event.id === qrEventId);
  const registrations = myRegistrations.filter((registration) => {
    if (statusFilter === "Confirmadas") return registration.status === "CONFIRMED";
    if (statusFilter === "Canceladas") return registration.status.startsWith("CANCELLED_");
    return true;
  });

  useEffect(() => {
    if (section !== "Inscrições") return;
    let active = true;

    async function loadRegistrations() {
      setRegistrationsLoading(true);
      setRegistrationsLoaded(false);
      setRegistrationsError(null);
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) throw new Error("Token indisponível.");
        const page = await getMyRegistrations(keycloak.token);
        if (active) {
          setMyRegistrations(page.items);
          setRegistrationsLoaded(true);
        }
      } catch {
        if (active) setRegistrationsError("Não foi possível carregar suas inscrições.");
      } finally {
        if (active) setRegistrationsLoading(false);
      }
    }

    void loadRegistrations();
    return () => {
      active = false;
    };
  }, [keycloak, section]);

  async function handleCancelRegistration(registration: Registration) {
    setRegistrationBusy(registration.id);
    setRegistrationsError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token indisponível.");
      const updated = await cancelRegistration(keycloak.token, registration.id);
      setMyRegistrations((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      const detail = error instanceof RegistrationApiError ? error.detail : "Tente novamente mais tarde.";
      setRegistrationsError(
        detail === "CANCELLATION_WINDOW_CLOSED"
          ? "O cancelamento só pode ser feito até 24 horas antes do evento."
          : `Não foi possível cancelar a inscrição: ${detail}`,
      );
    } finally {
      setRegistrationBusy(null);
    }
  }

  function toggleNotification(id: string) {
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item)));
  }

  return (
    <div className="mock-page my-space-page">
      <div className="page-heading-row">
        <div className="page-intro product-page-intro">
          <p className="eyebrow">Sua vida na universidade</p>
          <h1>Meu espaço</h1>
          <p>Reúna seu perfil, suas preferências e o que você acompanha na UNIR.</p>
        </div>
        {section !== "Inscrições" && (
          <span className="preview-badge">
            <span aria-hidden="true" /> Prévia visual
          </span>
        )}
      </div>
      <div className="my-space-layout">
        <nav className="my-space-tabs" aria-label="Seções do meu espaço">
          {sections.map((item) => (
            <button
              key={item}
              type="button"
              className={section === item ? "is-active" : ""}
              aria-current={section === item ? "page" : undefined}
              onClick={() => setSection(item)}
            >
              <span>{item}</span>
              {item === "Inscrições" && registrationsLoaded && <small>{myRegistrations.length}</small>}
            </button>
          ))}
        </nav>
        <main className="my-space-content">
          {section === "Dados da conta" && (
            <section className="mock-panel">
              <div className="mock-panel-heading">
                <span className="eyebrow">Meu perfil</span>
                <h2>Dados da conta</h2>
                <p>Informações básicas usadas para identificar você na comunidade universitária.</p>
              </div>
              <div className="account-summary">
                <span className="avatar avatar-large">{mockCurrentUser.name[0]}</span>
                <div>
                  <strong>{mockCurrentUser.name}</strong>
                  <span>{mockCurrentUser.email}</span>
                </div>
                <Link className="button button-secondary" to="/perfil">
                  Editar conta
                </Link>
              </div>
              <dl className="account-details-grid">
                <div>
                  <dt>Matrícula</dt>
                  <dd>{mockCurrentUser.registration}</dd>
                </div>
                <div>
                  <dt>Situação</dt>
                  <dd>{mockCurrentUser.status}</dd>
                </div>
                <div>
                  <dt>Nível de formação</dt>
                  <dd>{mockCurrentUser.level}</dd>
                </div>
                <div>
                  <dt>Curso</dt>
                  <dd>{mockCurrentUser.course}</dd>
                </div>
                <div>
                  <dt>Departamento</dt>
                  <dd>{mockCurrentUser.department}</dd>
                </div>
              </dl>
              <p className="mock-note">Os dados acadêmicos nesta prévia são exemplos e não são validados pela UFLA.</p>
            </section>
          )}

          {section === "Preferências" && (
            <section className="mock-panel">
              <div className="mock-panel-heading">
                <span className="eyebrow">Personalização</span>
                <h2>Suas preferências</h2>
                <p>Ajude a UNIR a destacar assuntos e espaços que fazem sentido para você.</p>
              </div>
              <label className="mock-field-label" htmlFor="my-interests">
                Interesses
              </label>
              <textarea
                id="my-interests"
                className="mock-textarea"
                value={interests}
                onChange={(event) => setInterests(event.target.value)}
              />
              <p className="mock-note">
                Um interesse por linha. Alterações ficam apenas nesta prévia enquanto a página estiver aberta.
              </p>
              <div className="preference-row">
                <span>
                  <strong>Aparência</strong>
                  <small>{mockCurrentUser.theme}</small>
                </span>
                <Link className="button button-secondary" to="/aparencia">
                  Personalizar aparência
                </Link>
              </div>
              <div className="mock-subheading">
                <h3>Espaços que você segue</h3>
                <p>Encontre rapidamente entidades e comunidades no seu espaço.</p>
              </div>
              <div className="followed-space-list">
                {followedSpaces.map((space) => (
                  <Link key={space.id} to={spacePath(space)}>
                    <span className={`entity-avatar entity-avatar-${space.tone}`}>{space.initials}</span>
                    <span>
                      <strong>{space.name}</strong>
                      <small>{space.spaceKind === "community" ? "Comunidade" : space.type}</small>
                    </span>
                    <Icon name="arrowUpRight" width="15" height="15" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {section === "Notificações" && (
            <section className="mock-panel">
              <div className="mock-panel-heading">
                <span className="eyebrow">O que você quer acompanhar?</span>
                <h2>Notificações</h2>
                <p>Escolha quais novidades dos espaços seguidos devem aparecer para você.</p>
              </div>
              <div className="notification-list">
                {notifications.map((item) => {
                  const space = spaces.find((candidate) => candidate.id === item.spaceId);
                  return (
                    <label className="notification-row" key={item.id}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>
                          {item.detail}
                          {space ? ` · ${space.name}` : ""}
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={() => toggleNotification(item.id)}
                        aria-label={item.label}
                      />
                    </label>
                  );
                })}
              </div>
              <p className="mock-note">As escolhas são temporárias nesta demonstração.</p>
            </section>
          )}

          {section === "Inscrições" && (
            <section className="mock-panel">
              <div className="mock-panel-heading">
                <span className="eyebrow">Sua agenda</span>
                <h2>Minhas inscrições</h2>
                <p>Acompanhe as inscrições de eventos vinculadas à sua conta UNIR.</p>
              </div>
              <div className="registration-filters" role="group" aria-label="Filtrar inscrições">
                {statuses.map((status) => (
                  <button
                    type="button"
                    key={status}
                    className={statusFilter === status ? "is-active" : ""}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div className="registration-list">
                {registrationsLoading ? (
                  <p className="notice" role="status">
                    Carregando inscrições…
                  </p>
                ) : (
                  registrations.map((registration) => {
                    const event = registration.event;
                    const date = new Date(event.startsAt);
                    return (
                      <article className="registration-card" key={registration.id}>
                        <div className="event-date">
                          <strong>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(date)}</strong>
                          <span>
                            {new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "")}
                          </span>
                        </div>
                        <div className="registration-card-copy">
                          <span
                            className={`registration-status ${registration.status === "CONFIRMED" ? "status-confirmada" : ""}`}
                          >
                            {registrationStatusLabel(registration.status)}
                          </span>
                          <h3>
                            <Link to={`/eventos/${event.id}`}>{event.title}</Link>
                          </h3>
                          <p>{registrationDate(event.startsAt)}</p>
                          <span>{event.location}</span>
                        </div>
                        <div className="registration-card-actions">
                          <Link className="button button-secondary" to={`/eventos/${event.id}`}>
                            Ver evento
                          </Link>
                          {registration.status === "CONFIRMED" && registrationCanBeCancelled(registration) && (
                            <button
                              className="button button-secondary"
                              type="button"
                              disabled={registrationBusy === registration.id}
                              onClick={() => void handleCancelRegistration(registration)}
                            >
                              {registrationBusy === registration.id ? "Cancelando…" : "Cancelar inscrição"}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
                {!registrationsLoading && registrations.length === 0 && (
                  <div className="empty-state">
                    <strong>Nenhuma inscrição neste estado</strong>
                    <span>Eventos em que você se inscrever aparecerão aqui.</span>
                  </div>
                )}
              </div>
              {registrationsError && (
                <p className="notice notice-error" role="alert">
                  {registrationsError}
                </p>
              )}
            </section>
          )}

          {section === "Acessos e QR" && (
            <section className="mock-panel">
              <div className="mock-panel-heading">
                <span className="eyebrow">Entrada em atividades</span>
                <h2>Meus acessos</h2>
                <p>Credenciais e registros de presença associados às suas inscrições.</p>
              </div>
              <div className="access-list">
                {mockRegistrations.map((registration) => {
                  const event = events.find((item) => item.id === registration.eventId);
                  if (!event) return null;
                  return (
                    <article className="access-card" key={registration.id}>
                      <span className={`access-indicator ${registration.access === "Ativo" ? "is-active" : ""}`}>
                        <Icon name={registration.access === "Ativo" ? "check" : "calendar"} width="17" height="17" />
                      </span>
                      <span>
                        <strong>{event.title}</strong>
                        <small>
                          {event.date} · {registration.access}
                        </small>
                      </span>
                      {registration.access === "Ativo" ? (
                        <button type="button" className="text-link-button" onClick={() => setQrEventId(event.id)}>
                          Abrir QR
                        </button>
                      ) : (
                        <span className="access-record-state">{registration.access}</span>
                      )}
                    </article>
                  );
                })}
              </div>
              <p className="mock-note">Os QR codes são ilustrativos, não podem ser usados para liberar acesso.</p>
            </section>
          )}
        </main>
      </div>
      {qrEvent && qrRegistration && (
        <div className="mock-modal-backdrop" role="presentation" onClick={() => setQrEventId(null)}>
          <section
            className="qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="modal-close" type="button" aria-label="Fechar QR" onClick={() => setQrEventId(null)}>
              ×
            </button>
            <span className="eyebrow">Acesso ilustrativo</span>
            <h2 id="qr-title">{qrEvent.title}</h2>
            <p>
              {qrEvent.date} · {qrRegistration.status}
            </p>
            <MockQrCode />
            <strong>QR de demonstração</strong>
            <small>Não é um código válido para leitura.</small>
            <button className="button button-secondary" type="button" onClick={() => setQrEventId(null)}>
              Fechar
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

function MockQrCode() {
  return (
    <div className="mock-qr" aria-hidden="true">
      {Array.from({ length: 21 * 21 }, (_, index) => {
        const x = index % 21;
        const y = Math.floor(index / 21);
        const finder = [
          [0, 0],
          [14, 0],
          [0, 14],
        ].some(([left, top]) => {
          const inside = x >= left && x < left + 7 && y >= top && y < top + 7;
          const border = x === left || x === left + 6 || y === top || y === top + 6;
          const center = x >= left + 2 && x <= left + 4 && y >= top + 2 && y <= top + 4;
          return inside && (border || center);
        });
        const cell = (x * 7 + y * 11 + x * y) % 9 < 4;
        return <i key={index} className={finder || cell ? "is-filled" : ""} />;
      })}
    </div>
  );
}
