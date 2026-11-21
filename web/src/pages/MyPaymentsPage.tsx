import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import {
  confirmSimulatedPayment,
  getMyPayments,
  PaymentApiError,
  type PaymentCharge,
} from "../services/payments.js";

interface WebContext {
  keycloak: Keycloak;
}

function currency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function formatDateTime(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: "Aguardando pagamento",
    PAID: "Pago",
    EXPIRED: "Expirado",
    CANCELLED: "Cancelado",
    REFUND_PENDING: "Estorno em andamento",
    REFUNDED: "Estornado",
    REFUND_FAILED: "Falha no estorno",
  };
  return labels[status] ?? status;
}

export function MyPaymentsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [charges, setCharges] = useState<PaymentCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const response = await getMyPayments(keycloak.token);
      setCharges(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar seus pagamentos.");
    } finally {
      setLoading(false);
    }
  }, [keycloak]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  async function handleConfirmPayment(charge: PaymentCharge) {
    setPayingId(charge.referenceId);
    setError(null);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      await confirmSimulatedPayment(keycloak.token, charge.referenceId);
      setFeedback(
        "Pagamento confirmado! Sua inscrição será liberada automaticamente em Meus tickets (eventos) ou Meus esportes (campeonatos).",
      );
      await loadPayments();
    } catch (err) {
      setError(err instanceof PaymentApiError ? err.message : "Não foi possível confirmar o pagamento.");
    } finally {
      setPayingId(null);
    }
  }

  const pendingCharges = charges.filter((charge) => charge.status === "PENDING");
  const historyCharges = charges.filter((charge) => charge.status !== "PENDING");

  return (
    <div className="browse-page capability-page sports-page">
      <header className="sports-hero">
        <div className="sports-hero-copy">
          <p className="sports-kicker">
            <span aria-hidden="true">●</span> Central financeira · Saga de pagamento
          </p>
          <h1>Meus Pagamentos</h1>
          <p>
            Acompanhe suas cobranças pendentes de eventos e esportes. Assim que o pagamento é confirmado, o evento vai
            para Meus tickets e o campeonato vai para Meus esportes automaticamente.
          </p>
        </div>
        <div className="sports-hero-count" aria-label={`${pendingCharges.length} pagamentos pendentes`}>
          <strong>{pendingCharges.length}</strong>
          <span>Pendente(s)</span>
        </div>
      </header>

      {loading && (
        <p className="notice" role="status">
          Carregando cobranças…
        </p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <div className="sports-my-matches" role="status">
          <p className="sports-my-match-versus">{feedback}</p>
          <div className="sports-qr-admin">
            <Link className="button button-secondary" to="/tickets">
              Ir para Meus tickets
            </Link>
            <Link className="button button-primary" to="/meus-esportes">
              Ir para Meus esportes
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="sports-section" aria-labelledby="payments-pending-title">
            <div className="sports-section-heading">
              <div>
                <p className="sports-kicker">Ação necessária</p>
                <h2 id="payments-pending-title">Pendentes de pagamento</h2>
              </div>
              <button type="button" className="button button-secondary" onClick={() => void loadPayments()}>
                Atualizar
              </button>
            </div>
            {pendingCharges.length > 0 ? (
              <div className="sports-catalog-grid">
                {pendingCharges.map((charge) => (
                  <article key={charge.chargeId} className="sports-catalog-card">
                    <div className="sports-catalog-card-heading">
                      <span className="sports-catalog-icon" aria-hidden="true">
                        💳
                      </span>
                      <span className="sports-catalog-tags">
                        <span className="sports-catalog-level">{statusLabel(charge.status)}</span>
                        <span className="sports-catalog-type">{charge.provider}</span>
                      </span>
                    </div>
                    <h3>{currency(charge.amountMinor)}</h3>
                    <dl className="sports-catalog-facts">
                      <div>
                        <dt>Referência</dt>
                        <dd>{charge.referenceId.slice(0, 8)}…</dd>
                      </div>
                      <div>
                        <dt>Vencimento</dt>
                        <dd>{formatDateTime(charge.expiresAt)}</dd>
                      </div>
                    </dl>
                    {charge.pixCopyPaste && (
                      <div className="sports-field">
                        <span>PIX copia e cola (simulado)</span>
                        <input type="text" readOnly value={charge.pixCopyPaste} />
                      </div>
                    )}
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={payingId === charge.referenceId}
                      onClick={() => void handleConfirmPayment(charge)}
                    >
                      {payingId === charge.referenceId ? "Confirmando…" : "Confirmar pagamento (PIX simulado)"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="sports-empty">Você não tem nenhum pagamento pendente no momento.</p>
            )}
          </section>

          <section className="sports-section" aria-labelledby="payments-history-title">
            <div className="sports-section-heading">
              <div>
                <p className="sports-kicker">Registro consolidado</p>
                <h2 id="payments-history-title">Histórico de pagamentos</h2>
              </div>
              <span className="sports-count">{historyCharges.length} registro(s)</span>
            </div>
            {historyCharges.length > 0 ? (
              <div className="sports-matches-list">
                {historyCharges.map((charge) => (
                  <article key={charge.chargeId} className="sports-match-card">
                    <div className="sports-match-head">
                      <span className="sports-catalog-type">{statusLabel(charge.status)}</span>
                      <span className="sports-match-meta">
                        {charge.paidAt ? `Pago em ${formatDateTime(charge.paidAt)}` : formatDateTime(charge.createdAt)}
                      </span>
                    </div>
                    <div className="sports-team-card-head">
                      <strong>{currency(charge.amountMinor)}</strong>
                      <small>Inscrição {charge.referenceId.slice(0, 8)}…</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="sports-empty">Nenhum pagamento concluído ainda.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
