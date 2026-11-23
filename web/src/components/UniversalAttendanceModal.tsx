import { useMemo } from "react";
import { ParticipantQrScanner } from "./ParticipantQrScanner";

export interface UniversalAttendanceModalProps {
  title: string;
  subtitle: string;
  mode: "participant" | "organizer";
  busy: boolean;
  token?: string | null;
  qrSvg?: string | null;
  checkedIn?: boolean;
  error?: string | null;
  feedback?: string | null;
  onClose: () => void;
  onSubmitToken?: (token: string) => void;
  onGenerateToken?: () => void;
}

/**
 * Generates a simple visual QR-like SVG matrix from an opaque code string when
 * the backend returns a text code (e.g. sports match check-in code) without raw SVG.
 */
function buildFallbackQrSvg(code: string): string {
  const size = 21;
  const cell = 8;
  const pad = 16;
  const total = size * cell + pad * 2;
  let hash = 2166136261;
  for (let i = 0; i < code.length; i++) {
    hash ^= code.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const rects: string[] = [];
  const isFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      let dark: boolean;
      if (isFinder(r, c)) {
        const lr = r < 7 ? r : r - (size - 7);
        const lc = c < 7 ? c : c - (size - 7);
        dark = lr === 0 || lr === 6 || lc === 0 || lc === 6 || (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4);
      } else {
        const bit = ((hash >>> ((r * size + c) % 24)) ^ (r * 31 + c * 17 + code.charCodeAt((r + c) % code.length))) & 1;
        dark = bit === 1;
      }
      if (dark) {
        rects.push(
          `<rect x="${pad + c * cell}" y="${pad + r * cell}" width="${cell}" height="${cell}" fill="#0f172a"/>`,
        );
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="200" height="200"><rect width="100%" height="100%" rx="12" fill="#ffffff"/>${rects.join("")}</svg>`;
}

export function UniversalAttendanceModal({
  title,
  subtitle,
  mode,
  busy,
  token,
  qrSvg,
  checkedIn = false,
  error,
  feedback,
  onClose,
  onSubmitToken,
  onGenerateToken,
}: UniversalAttendanceModalProps) {
  const qrDataUri = useMemo(() => {
    const svg = qrSvg ?? (token ? buildFallbackQrSvg(token) : null);
    if (!svg) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [qrSvg, token]);

  return (
    <div className="sports-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sports-modal" style={{ maxWidth: "500px" }} onClick={(event) => event.stopPropagation()}>
        <header className="sports-modal-header">
          <div>
            <p className="sports-kicker">
              {mode === "organizer" ? "Painel de Presença · Organizador" : "Confirmação de Presença"}
            </p>
            <h2>{title}</h2>
            <p style={{ margin: "0.25rem 0 0", opacity: 0.8, fontSize: "0.9rem" }}>{subtitle}</p>
          </div>
          <button type="button" className="sports-modal-close" aria-label="Fechar" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="sports-modal-body">
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          {feedback && (
            <p className="notice" role="status">
              {feedback}
            </p>
          )}

          {mode === "organizer" ? (
            <div className="sports-modal-stack" style={{ alignItems: "center", textAlign: "center" }}>
              {token && qrDataUri ? (
                <>
                  <div
                    className="my-ticket-qr"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "1.25rem",
                    }}
                  >
                    <img
                      src={qrDataUri}
                      alt={`QR Code de presença para ${title}`}
                      style={{ width: "200px", height: "200px", borderRadius: "12px" }}
                    />
                    <span>Apresente este QR Code ou compartilhe o código abaixo com os participantes:</span>
                    <code
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        padding: "0.5rem 1rem",
                        borderRadius: "8px",
                        background: "rgba(15, 23, 42, 0.4)",
                        wordBreak: "break-all",
                      }}
                    >
                      {token}
                    </code>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => void navigator.clipboard?.writeText(token)}
                    >
                      Copiar código de presença
                    </button>
                    {onGenerateToken && (
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={busy}
                        onClick={onGenerateToken}
                      >
                        {busy ? "Gerando…" : "Gerar novo código"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ padding: "1.5rem 0" }}>
                  <p style={{ marginBottom: "1rem" }}>
                    Gere o código e o QR Code oficial para liberar a confirmação de presença desta atividade.
                  </p>
                  {onGenerateToken && (
                    <button type="button" className="button button-primary" disabled={busy} onClick={onGenerateToken}>
                      {busy ? "Gerando código…" : "Gerar Código e QR de Presença"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : checkedIn ? (
            <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <span className="sports-checked-badge" style={{ fontSize: "1.05rem", padding: "0.6rem 1.2rem" }}>
                ✓ Sua presença já está confirmada!
              </span>
            </div>
          ) : (
            <div className="sports-modal-stack">
              <p style={{ margin: 0 }}>
                Escaneie o QR Code exibido pelo organizador ou cole o código de presença fornecido no local:
              </p>
              {onSubmitToken && (
                <ParticipantQrScanner
                  busy={busy}
                  autoSubmitOnScan
                  submitLabel="Confirmar presença"
                  onToken={onSubmitToken}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
