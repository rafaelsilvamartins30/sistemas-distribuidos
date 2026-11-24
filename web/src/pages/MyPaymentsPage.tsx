import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { FeedbackNotice } from "../components/FeedbackNotice";
import { PaymentCheckoutModal } from "../components/PaymentCheckoutModal";
import { SemesterSelector } from "../components/SemesterSelector";
import { useToast } from "../contexts/ToastContext";
import { isDateInSemester, useSemesterFilter } from "../hooks/useSemesterFilter";
import { getMyPayments, type PaymentCharge } from "../services/payments.js";
import { extractErrorMessage } from "../utils/apiError.js";
import { formatBrl } from "../utils/currency.js";

interface WebContext {
  keycloak: Keycloak;
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

function paymentOriginLabel(origin: PaymentCharge["origin"]): string {
  switch (origin) {
    case "EVENT":
      return "Evento";
    case "SPORTS_TEAM":
      return "Esporte · Equipe";
    case "SPORTS_FREE_AGENT":
      return "Esporte · Free Agent";
    default:
      return "Inscrição";
  }
}

export function MyPaymentsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedType = searchParams.get("tipo");
  const type = requestedType === "eventos" || requestedType === "esportes" ? requestedType : "todos";
  const [charges, setCharges] = useState<PaymentCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<PaymentCharge | null>(null);
  const { semesters, selectedTerm, selectedSemester, setSelectedTerm } = useSemesterFilter(keycloak.token ?? "");

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const response = await getMyPayments(keycloak.token);
      setCharges(response.items);
    } catch (err) {
      setLoadFailed(true);
      toast.error(extractErrorMessage(err, "Não foi possível carregar seus pagamentos."));
    } finally {
      setLoading(false);
    }
  }, [keycloak, toast]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const visibleCharges = charges.filter(
    (charge) =>
      isDateInSemester(charge.createdAt, selectedSemester) &&
      (type === "todos" ||
        (type === "eventos"
          ? charge.origin === "EVENT"
          : charge.origin === "SPORTS_TEAM" || charge.origin === "SPORTS_FREE_AGENT")),
  );
  const pendingCharges = visibleCharges.filter((charge) => charge.status === "PENDING");
  const historyCharges = visibleCharges.filter((charge) => charge.status !== "PENDING");

  return (
    <div className="browse-page capability-page sports-page">
      <header className="sports-hero">
        <div className="sports-hero-copy">
          <p className="sports-kicker">
            <span aria-hidden="true">●</span> Central financeira
          </p>
          <h1>Meus Pagamentos</h1>
          <p>
            Acompanhe e pague suas cobranças de eventos e esportes em um único lugar. Assim que o Pix é confirmado, sua
            inscrição é liberada automaticamente.
          </p>
        </div>
        <div className="sports-hero-actions">
          <label className="semester-filter">
            Tipo de inscrição
            <select
              value={type}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                if (event.target.value === "todos") next.delete("tipo");
                else next.set("tipo", event.target.value);
                setSearchParams(next, { replace: true });
              }}
            >
              <option value="todos">Todos</option>
              <option value="eventos">Eventos</option>
              <option value="esportes">Esportes</option>
            </select>
          </label>
          <SemesterSelector
            id="my-payments-semester"
            value={selectedTerm}
            semesters={semesters}
            onChange={setSelectedTerm}
          />
          <div className="sports-hero-count" aria-label={`${pendingCharges.length} pagamentos pendentes`}>
            <strong>{pendingCharges.length}</strong>
            <span>Pendente(s)</span>
          </div>
        </div>
      </header>

      {loading && <FeedbackNotice>Carregando cobranças…</FeedbackNotice>}
      {charges.some((charge) => !charge.origin || charge.origin === "UNKNOWN") && (
        <FeedbackNotice>Algumas cobranças estão sem categoria. Selecione Todos para vê-las.</FeedbackNotice>
      )}

      {!loading && !loadFailed && (
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
                        <span className="sports-catalog-type">{paymentOriginLabel(charge.origin)}</span>
                      </span>
                    </div>
                    <h3>{charge.title ?? paymentOriginLabel(charge.origin)}</h3>
                    {charge.subtitle && <p className="payment-card-subtitle">{charge.subtitle}</p>}
                    <p className="payment-card-price">{formatBrl(charge.amountMinor)}</p>
                    <dl className="sports-catalog-facts">
                      <div>
                        <dt>Vencimento</dt>
                        <dd>{formatDateTime(charge.expiresAt)}</dd>
                      </div>
                      <div>
                        <dt>Emitido em</dt>
                        <dd>{formatDateTime(charge.createdAt)}</dd>
                      </div>
                    </dl>
                    <div className="payment-card-actions">
                      <button type="button" className="button button-primary" onClick={() => setSelectedCharge(charge)}>
                        Pagar com Pix
                      </button>
                      {charge.targetPath && (
                        <Link className="button button-secondary" to={charge.targetPath}>
                          Ver detalhes
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="sports-empty">Nenhum pagamento pendente para os filtros selecionados.</p>
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
                      <div className="payment-history-title">
                        <strong>{charge.title ?? paymentOriginLabel(charge.origin)}</strong>
                        <small>{charge.subtitle ?? paymentOriginLabel(charge.origin)}</small>
                      </div>
                      <strong>{formatBrl(charge.amountMinor)}</strong>
                    </div>
                    {charge.targetPath && (
                      <div className="payment-card-actions">
                        <Link className="text-link" to={charge.targetPath}>
                          Ver inscrição →
                        </Link>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="sports-empty">Nenhum registro no histórico ainda.</p>
            )}
          </section>
        </>
      )}

      {selectedCharge && (
        <PaymentCheckoutModal
          keycloak={keycloak}
          charge={selectedCharge}
          onConfirmed={loadPayments}
          onClose={() => setSelectedCharge(null)}
        />
      )}
    </div>
  );
}
