import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { RegistrationRefundPolicy } from "./RegistrationRefundPolicy";

export interface RegistrationPaymentNoticeProps {
  origin: "eventos" | "esportes";
  deadline?: string;
  onPayNow?: () => void;
  busy?: boolean;
}

export function RegistrationPaymentNotice({
  origin,
  deadline,
  onPayNow,
  busy = false,
}: RegistrationPaymentNoticeProps) {
  return (
    <div className="payment-status-panel">
      <span className="payment-status-icon" aria-hidden="true">
        <Icon name="clock" width="20" height="20" />
      </span>
      <div className="payment-status-copy">
        <strong>Inscrição aguardando pagamento</strong>
        <p role="status">
          {onPayNow
            ? "Conclua o Pix agora mesmo ou acompanhe sua cobrança em Meus pagamentos."
            : "Conclua o Pix em Meus pagamentos. A confirmação pode levar alguns instantes."}
        </p>
        {deadline && (
          <p className="payment-status-deadline">
            Pague até <strong>{deadline}</strong>.
          </p>
        )}
        <RegistrationRefundPolicy origin={origin} />
        <div className="payment-notice-actions">
          {onPayNow && (
            <button type="button" className="button button-primary" disabled={busy} onClick={onPayNow}>
              {busy ? "Abrindo cobrança…" : "Pagar agora (Pix)"}
            </button>
          )}
          <Link
            className={onPayNow ? "button button-secondary" : "button button-primary"}
            to={`/pagamentos?tipo=${origin}`}
          >
            Meus pagamentos
          </Link>
        </div>
      </div>
    </div>
  );
}
