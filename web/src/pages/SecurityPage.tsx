import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";
import {
  endMySession,
  formatSessionDate,
  getMySessions,
  hasTotpCredential,
  KeycloakAccountError,
  sessionClientNames,
  type KeycloakSession,
} from "../services/keycloakAccount";

interface AccountContext {
  keycloak: Keycloak;
}

type TotpStatus = "loading" | "configured" | "missing" | "error";

function accountError(error: unknown): string {
  if (error instanceof KeycloakAccountError && error.status === 401)
    return "Sua sessão expirou. Entre novamente para continuar.";
  if (error instanceof KeycloakAccountError && error.status === 403)
    return "Esta sessão não tem permissão para consultar dados de segurança da conta.";
  return "Não foi possível consultar o Keycloak. Verifique a conexão e tente novamente.";
}

export function SecurityPage() {
  const { keycloak } = useOutletContext<AccountContext>();
  const [totpStatus, setTotpStatus] = useState<TotpStatus>("loading");
  const [totpError, setTotpError] = useState("");
  const [sessions, setSessions] = useState<KeycloakSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [revoking, setRevoking] = useState("");

  const loadSecurityData = useCallback(async () => {
    setTotpStatus("loading");
    setTotpError("");
    setSessionsLoading(true);
    setSessionsError("");
    const [totpResult, sessionsResult] = await Promise.allSettled([
      hasTotpCredential(keycloak),
      getMySessions(keycloak),
    ]);

    if (totpResult.status === "fulfilled") setTotpStatus(totpResult.value ? "configured" : "missing");
    else {
      setTotpStatus("error");
      setTotpError(accountError(totpResult.reason));
    }

    if (sessionsResult.status === "fulfilled") setSessions(sessionsResult.value);
    else setSessionsError(accountError(sessionsResult.reason));
    setSessionsLoading(false);
  }, [keycloak]);

  useEffect(() => {
    void loadSecurityData();
  }, [loadSecurityData]);

  function startAction(action: "CONFIGURE_TOTP" | "UPDATE_PASSWORD" | "UPDATE_EMAIL") {
    const redirectUri = `${window.location.origin}/seguranca`;
    const requiresFreshAuthentication = action === "UPDATE_PASSWORD" || action === "UPDATE_EMAIL";
    void keycloak.login({
      action,
      redirectUri,
      ...(requiresFreshAuthentication ? { prompt: "login", maxAge: 0 } : {}),
    });
  }

  async function revokeSession(session: KeycloakSession) {
    if (!window.confirm("Encerrar esta sessão? O dispositivo precisará entrar novamente.")) return;
    setRevoking(session.id);
    setSessionsError("");
    try {
      await endMySession(keycloak, session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (error) {
      setSessionsError(accountError(error));
    } finally {
      setRevoking("");
    }
  }

  const email = String(keycloak.tokenParsed?.email ?? "E-mail não disponível");
  const emailVerified = Boolean(keycloak.tokenParsed?.email_verified);

  return (
    <>
      <div className="page-intro">
        <h2>Proteja sua conta</h2>
        <p>Senha, e-mail, autenticação em duas etapas e sessões ficam sob responsabilidade do Keycloak.</p>
      </div>

      <div className="card-grid">
        <section className="setting-card" aria-labelledby="email-security-title">
          <div className="setting-card-main">
            <span className="setting-icon">
              <Icon name="mail" />
            </span>
            <div className="setting-copy">
              <h3 id="email-security-title">E-mail de acesso</h3>
              <p>{email}</p>
              <span className={`status-pill ${emailVerified ? "is-enabled" : ""}`}>
                {emailVerified ? "E-mail verificado" : "E-mail pendente de verificação"}
              </span>
              <p>
                Para alterar, confirme novamente sua senha
                {totpStatus === "configured" ? " e o código do autenticador." : "."}
              </p>
            </div>
          </div>
          <div className="setting-card-action">
            <button
              className="button button-secondary button-small"
              disabled={totpStatus === "loading" || totpStatus === "error"}
              onClick={() => startAction("UPDATE_EMAIL")}
            >
              Alterar e-mail
            </button>
          </div>
        </section>

        <section className="setting-card" aria-labelledby="totp-title">
          <div className="setting-card-main">
            <span className="setting-icon">
              <Icon name="shield" />
            </span>
            <div className="setting-copy">
              <h3 id="totp-title">Autenticação em duas etapas</h3>
              <p>Use um aplicativo autenticador para confirmar ações importantes e proteger o acesso à sua conta.</p>
              <span className={`status-pill ${totpStatus === "configured" ? "is-enabled" : ""}`}>
                {totpStatus === "loading"
                  ? "Verificando configuração…"
                  : totpStatus === "configured"
                    ? "2FA ativa"
                    : totpStatus === "missing"
                      ? "Ainda não configurada"
                      : "Não foi possível verificar"}
              </span>
              {totpError && (
                <p className="notice notice-error" role="alert">
                  {totpError}
                </p>
              )}
            </div>
          </div>
          <div className="setting-card-action">
            <button
              className="button button-secondary button-small"
              disabled={totpStatus === "loading" || totpStatus === "error"}
              onClick={() => startAction("CONFIGURE_TOTP")}
            >
              {totpStatus === "configured" ? "Reconfigurar 2FA" : "Configurar 2FA"}
            </button>
          </div>
        </section>

        <section className="setting-card" aria-labelledby="password-security-title">
          <div className="setting-card-main">
            <span className="setting-icon">
              <Icon name="lock" />
            </span>
            <div className="setting-copy">
              <h3 id="password-security-title">Senha</h3>
              <p>
                A alteração acontece na etapa segura do Keycloak e volta para esta tela ao terminar.
                {totpStatus === "configured"
                  ? " Confirme novamente sua senha e o código do autenticador."
                  : " Confirme novamente sua senha."}
              </p>
              {totpStatus === "configured" && <span className="status-pill is-enabled">Senha + 2FA exigidas</span>}
            </div>
          </div>
          <div className="setting-card-action">
            <button
              className="button button-secondary button-small"
              disabled={totpStatus === "loading" || totpStatus === "error"}
              onClick={() => startAction("UPDATE_PASSWORD")}
            >
              Alterar senha
            </button>
          </div>
        </section>
      </div>

      {totpStatus === "missing" && (
        <p className="notice">
          Sem 2FA, a troca pede apenas sua senha. Configure o autenticador para exigir também o código.
        </p>
      )}
      {sessionsError && (
        <p className="notice notice-error" role="alert">
          {sessionsError}
        </p>
      )}

      <section className="appearance-section" aria-labelledby="sessions-title">
        <h3 id="sessions-title">Sessões ativas</h3>
        <p>Confira onde sua conta está conectada e encerre sessões que não reconhece.</p>
        {sessionsLoading ? (
          <p className="notice">Carregando sessões…</p>
        ) : sessionsError ? (
          <button className="button button-secondary button-small retry-button" onClick={() => void loadSecurityData()}>
            Tentar novamente
          </button>
        ) : sessions.length === 0 ? (
          <p className="notice">Nenhuma sessão ativa encontrada.</p>
        ) : (
          <div className="session-list">
            {sessions.map((session) => {
              const isCurrent = session.current === true;
              const clients = sessionClientNames(session.clients);
              return (
                <article className="session-card" key={session.id}>
                  <div className="session-details">
                    <span className="setting-icon">
                      <Icon name="device" />
                    </span>
                    <div className="session-copy">
                      <strong>
                        {session.ipAddress || "Dispositivo conectado"}
                        {isCurrent && <span className="session-current">Sessão atual</span>}
                      </strong>
                      <p>
                        Iniciada {formatSessionDate(session.started)} · Último acesso{" "}
                        {formatSessionDate(session.lastAccess)}
                      </p>
                      {clients.length > 0 && (
                        <div className="session-client-list">
                          {clients.map((client) => (
                            <span key={client}>{client}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="button button-danger button-small"
                    disabled={isCurrent || revoking === session.id}
                    onClick={() => void revokeSession(session)}
                  >
                    {revoking === session.id ? "Encerrando…" : isCurrent ? "Sessão atual" : "Encerrar sessão"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
