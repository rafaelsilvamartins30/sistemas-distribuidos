import { useState } from "react";
import { Link } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { useToast } from "../contexts/ToastContext";
import { confirmSimulatedPayment, type PaymentCharge } from "../services/payments.js";
import { extractErrorMessage } from "../utils/apiError.js";
import { formatBrl } from "../utils/currency.js";
import { Modal } from "./Modal";
import { RegistrationRefundPolicy } from "./RegistrationRefundPolicy";

export interface PaymentCheckoutModalProps {
  keycloak: Keycloak;
  charge: PaymentCharge | null;
  loading?: boolean;
  fallbackTitle?: string;
  fallbackSubtitle?: string;
  fallbackOrigin?: "eventos" | "esportes";
  onConfirmed?: () => Promise<void> | void;
  onClose: () => void;
}

function formatDateTime(value?: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function originKind(charge: PaymentCharge | null, fallback?: "eventos" | "esportes"): "eventos" | "esportes" {
  if (charge?.origin === "SPORTS_TEAM" || charge?.origin === "SPORTS_FREE_AGENT") return "esportes";
  if (charge?.origin === "EVENT") return "eventos";
  return fallback ?? "eventos";
}

function originBadgeLabel(charge: PaymentCharge | null, fallback?: "eventos" | "esportes"): string {
  switch (charge?.origin) {
    case "EVENT":
      return "Evento";
    case "SPORTS_TEAM":
      return "Esporte · Equipe";
    case "SPORTS_FREE_AGENT":
      return "Esporte · Free Agent";
    default:
      return fallback === "esportes" ? "Esporte" : "Evento";
  }
}

export function PaymentCheckoutModal({
  keycloak,
  charge,
  loading = false,
  fallbackTitle,
  fallbackSubtitle,
  fallbackOrigin,
  onConfirmed,
  onClose,
}: PaymentCheckoutModalProps) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const kind = originKind(charge, fallbackOrigin);
  const title = charge?.title || fallbackTitle || originBadgeLabel(charge, fallbackOrigin);
  const subtitle = charge?.subtitle || fallbackSubtitle || originBadgeLabel(charge, fallbackOrigin);

  async function handleConfirm() {
    if (!charge) return;
    setConfirming(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      await confirmSimulatedPayment(keycloak.token, charge.referenceId);
      setConfirmed(true);
      toast.success("Pagamento confirmado com sucesso!");
      await onConfirmed?.();
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível confirmar o pagamento."));
    } finally {
      setConfirming(false);
    }
  }

  function handleCopyPix() {
    if (!charge?.pixCopyPaste) return;
    void navigator.clipboard?.writeText(charge.pixCopyPaste);
    toast.success("Código Pix copiado para a área de transferência.");
  }

  return (
    <Modal
      eyebrow="Pagamento via Pix"
      title={title}
      subtitle={subtitle}
      badge={
        confirmed ? (
          <span className="attendance-status-pill is-closed">Pago</span>
        ) : (
          <span className="attendance-status-pill is-review">Pendente</span>
        )
      }
      size="sm"
      closeDisabled={confirming}
      onClose={onClose}
    >
      {loading ? (
        <div className="payment-modal-loading" role="status">
          <p>Preparando cobrança Pix…</p>
        </div>
      ) : confirmed ? (
        <div className="payment-modal-confirmed" role="status">
          <strong>Pagamento confirmado!</strong>
          <p>
            Sua inscrição está sendo liberada automaticamente. Você já pode acompanhar tudo em{" "}
            {kind === "eventos" ? "Meus tickets" : "Meus esportes"}.
          </p>
          <div className="payment-modal-actions">
            <Link
              className="button button-primary"
              to={kind === "eventos" ? "/tickets" : "/meus-esportes"}
              onClick={onClose}
            >
              {kind === "eventos" ? "Ir para Meus tickets" : "Ir para Meus esportes"}
            </Link>
            <button type="button" className="button button-secondary" onClick={onClose}>
              Continuar aqui
            </button>
          </div>
        </div>
      ) : !charge ? (
        <div className="payment-modal-confirmed">
          <strong>Cobrança em preparação</strong>
          <p>
            Sua cobrança Pix ainda está sendo emitida. Aguarde alguns instantes ou acompanhe diretamente em Meus
            pagamentos.
          </p>
          <div className="payment-modal-actions">
            <Link className="button button-primary" to={`/pagamentos?tipo=${kind}`} onClick={onClose}>
              Abrir Meus pagamentos
            </Link>
            <button type="button" className="button button-secondary" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <div className="payment-modal-stack">
          <div className="payment-modal-summary">
            <div>
              <span>Valor total</span>
              <strong>{formatBrl(charge.amountMinor)}</strong>
            </div>
            <div>
              <span>Vencimento</span>
              <small>{formatDateTime(charge.expiresAt)}</small>
            </div>
          </div>

          {charge.pixCopyPaste && (
            <div className="payment-modal-pix">
              <label htmlFor="pix-copy-paste-input">Pix copia e cola (ambiente simulado)</label>
              <div className="payment-modal-pix-row">
                <input id="pix-copy-paste-input" type="text" readOnly value={charge.pixCopyPaste} />
                <button type="button" className="button button-secondary" onClick={handleCopyPix}>
                  Copiar Pix
                </button>
              </div>
            </div>
          )}

          <RegistrationRefundPolicy origin={kind} />

          <div className="payment-modal-actions">
            <button type="button" className="button button-secondary" disabled={confirming} onClick={onClose}>
              Pagar depois
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={confirming}
              onClick={() => void handleConfirm()}
            >
              {confirming ? "Confirmando pagamento…" : "Confirmar pagamento (Pix)"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
