import { useState } from "react";
import { useToast } from "../contexts/ToastContext";
import type { EventAttendanceReview, OrganizerCheckInPreview } from "../services/attendance.js";
import { Modal } from "./Modal";
import { ParticipantQrScanner } from "./ParticipantQrScanner";

export interface UniversalAttendanceModalProps {
  title: string;
  subtitle: string;
  mode: "participant" | "participant-ticket" | "organizer";
  busy: boolean;
  token?: string | null;
  qrSvg?: string | null;
  checkedIn?: boolean;
  error?: string | null;
  feedback?: string | null;
  /** Organizer unified QR + Attendance List props */
  organizerCanManageQr?: boolean;
  organizerScanMode?: boolean;
  scannedTicket?: OrganizerCheckInPreview | null;
  scannerResetKey?: number;
  onPreviewParticipantQr?: (token: string) => void;
  onConfirmParticipantQr?: () => void;
  onResetScannedTicket?: () => void;
  attendanceReview?: EventAttendanceReview | null;
  attendanceListLoading?: boolean;
  canCloseAttendance?: boolean;
  onRefreshAttendanceList?: () => void;
  onCloseAttendanceList?: () => void;
  onClose: () => void;
  onSubmitToken?: (token: string) => void;
  onGenerateToken?: () => void;
}

type OrganizerTab = "qr" | "list";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
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
  organizerCanManageQr = true,
  organizerScanMode = false,
  scannedTicket = null,
  scannerResetKey = 0,
  onPreviewParticipantQr,
  onConfirmParticipantQr,
  onResetScannedTicket,
  attendanceReview = null,
  attendanceListLoading = false,
  canCloseAttendance = false,
  onRefreshAttendanceList,
  onCloseAttendanceList,
  onClose,
  onSubmitToken,
  onGenerateToken,
}: UniversalAttendanceModalProps) {
  const toast = useToast();
  const hasListPanel = mode === "organizer" && Boolean(onRefreshAttendanceList || attendanceReview);
  const [activeTab, setActiveTab] = useState<OrganizerTab>(
    mode === "organizer" && !organizerCanManageQr && !organizerScanMode && hasListPanel ? "list" : "qr",
  );
  const [confirmingClose, setConfirmingClose] = useState(false);

  const qrDataUri = qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : null;
  const entries = attendanceReview?.entries ?? [];
  const isClosed = Boolean(attendanceReview?.closedAt);

  function handleCopyList() {
    if (!entries.length) {
      toast.info("Nenhuma presença registrada para copiar.");
      return;
    }
    const header = `Lista de presença — ${title} (${subtitle})`;
    const lines = entries.map(
      (entry, index) => `${index + 1}. ${entry.name ?? entry.userId} — ${formatDateTime(entry.checkedInAt)}`,
    );
    void navigator.clipboard?.writeText([header, ...lines].join("\n"));
    toast.success(`Lista com ${entries.length} presença(s) copiada.`);
  }

  const eyebrow =
    mode === "organizer"
      ? "Painel de Presença · Organizador"
      : mode === "participant-ticket"
        ? "Ticket de Entrada"
        : "Confirmação de Presença";

  const statusBadge =
    mode === "organizer" && hasListPanel ? (
      isClosed ? (
        <span className="attendance-status-pill is-closed">Lista fechada</span>
      ) : (
        <span className="attendance-status-pill is-open">Check-in aberto</span>
      )
    ) : checkedIn ? (
      <span className="attendance-status-pill is-open">Presença confirmada</span>
    ) : (
      <span className="attendance-status-pill is-open">Check-in aberto</span>
    );

  const tabsNode =
    mode === "organizer" && hasListPanel ? (
      <div className="sports-modal-tabs" role="tablist" aria-label="Opções de presença">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "qr"}
          className={activeTab === "qr" ? "is-active" : ""}
          onClick={() => setActiveTab("qr")}
        >
          {organizerScanMode ? "Validar QR" : "QR Code"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "list"}
          className={activeTab === "list" ? "is-active" : ""}
          onClick={() => setActiveTab("list")}
        >
          Lista de presença ({entries.length})
        </button>
      </div>
    ) : undefined;

  return (
    <Modal
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      badge={statusBadge}
      tabs={tabsNode}
      size={mode === "organizer" ? "md" : "sm"}
      closeDisabled={busy}
      onClose={onClose}
    >
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
        activeTab === "list" && hasListPanel ? (
          <div className="attendance-list-panel">
            <div className="attendance-list-toolbar">
              <span className="attendance-list-summary">
                <strong>{entries.length}</strong> presença(s) registrada(s)
              </span>
              <div className="attendance-list-actions">
                {onRefreshAttendanceList && (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={attendanceListLoading || busy}
                    onClick={onRefreshAttendanceList}
                  >
                    {attendanceListLoading ? "Atualizando…" : "Atualizar"}
                  </button>
                )}
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={attendanceListLoading || !entries.length}
                  onClick={handleCopyList}
                >
                  Copiar lista
                </button>
              </div>
            </div>

            {attendanceListLoading ? (
              <p className="attendance-empty-box">Carregando lista de presença…</p>
            ) : entries.length > 0 ? (
              <ol className="attendance-entries-list">
                {entries.map((entry) => (
                  <li key={`${entry.userId}-${entry.checkedInAt}`}>
                    <span>{entry.name ?? entry.userId}</span>
                    <small>{formatDateTime(entry.checkedInAt)}</small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="attendance-empty-box">Nenhuma presença registrada até o momento.</p>
            )}

            <div className="attendance-list-footer">
              {attendanceReview?.closedAt ? (
                <p className="registration-confirmed" role="status">
                  Lista fechada em {formatDateTime(attendanceReview.closedAt)}.
                </p>
              ) : canCloseAttendance && onCloseAttendanceList ? (
                confirmingClose ? (
                  <div className="sports-modal-stack">
                    <p className="attendance-hint" role="status">
                      Deseja mesmo fechar a lista de presença? Após o fechamento, novos check-ins serão bloqueados e
                      quem não registrou presença constará como ausente.
                    </p>
                    <div className="attendance-qr-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={busy}
                        onClick={() => setConfirmingClose(false)}
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        className="button button-primary"
                        disabled={busy || attendanceListLoading}
                        onClick={() => {
                          setConfirmingClose(false);
                          onCloseAttendanceList();
                        }}
                      >
                        {busy ? "Fechando…" : "Sim, fechar lista"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busy || attendanceListLoading}
                    onClick={() => setConfirmingClose(true)}
                  >
                    {busy ? "Fechando…" : "Fechar lista de presença"}
                  </button>
                )
              ) : (
                <p className="attendance-hint">
                  As presenças aparecem aqui em tempo real até que a lista seja fechada.
                </p>
              )}
            </div>
          </div>
        ) : organizerScanMode && !isClosed ? (
          <div className="sports-modal-stack">
            <p className="attendance-hint">
              Leia o QR do participante pela câmera ou cole o código do ticket para consultar os dados e confirmar a
              entrada:
            </p>
            {onPreviewParticipantQr && (
              <ParticipantQrScanner
                busy={busy}
                autoSubmitOnScan
                cameraButtonLabel="Ler QR do participante"
                scanMessage="QR lido. Consultando dados do participante…"
                submitLabel="Verificar ticket"
                resetKey={scannerResetKey}
                onToken={onPreviewParticipantQr}
              />
            )}
            {scannedTicket && (
              <div className="organizer-ticket-preview" role="status">
                <strong>
                  {scannedTicket.status === "ATTENDED"
                    ? "✓ Presença já registrada"
                    : "Ticket válido · pronto para confirmar"}
                </strong>
                <span>Participante: {scannedTicket.participantName ?? scannedTicket.participantUserId}</span>
                <span>Evento: {scannedTicket.eventTitle}</span>
                <div className="attendance-qr-actions">
                  {scannedTicket.status !== "ATTENDED" && onConfirmParticipantQr && (
                    <button
                      className="button button-primary"
                      type="button"
                      disabled={busy}
                      onClick={onConfirmParticipantQr}
                    >
                      {busy ? "Confirmando…" : "Confirmar presença"}
                    </button>
                  )}
                  {onResetScannedTicket && (
                    <button
                      className="button button-secondary"
                      type="button"
                      disabled={busy}
                      onClick={onResetScannedTicket}
                    >
                      Validar próximo participante
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : organizerCanManageQr && !isClosed ? (
          <div className="attendance-qr-center">
            {token && qrDataUri ? (
              <>
                <div className="my-ticket-qr attendance-qr-card">
                  <img src={qrDataUri} alt={`QR Code de presença para ${title}`} className="attendance-qr-image" />
                  <span>Apresente este QR Code ou compartilhe o código abaixo com os participantes:</span>
                  <code className="attendance-code-pill">{token}</code>
                </div>
                <div className="attendance-qr-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(token);
                      toast.success("Código de presença copiado.");
                    }}
                  >
                    Copiar código
                  </button>
                  {onGenerateToken && (
                    <button type="button" className="button button-secondary" disabled={busy} onClick={onGenerateToken}>
                      {busy ? "Gerando…" : "Gerar novo QR"}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="attendance-empty-qr">
                <p className="attendance-hint">
                  Gere o QR Code oficial para liberar a confirmação de presença desta atividade.
                </p>
                {onGenerateToken && (
                  <button type="button" className="button button-primary" disabled={busy} onClick={onGenerateToken}>
                    {busy ? "Gerando QR…" : "Gerar QR Code de Presença"}
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="attendance-closed-box">
            <strong>Check-in por QR Code encerrado</strong>
            <p>A lista de presença deste evento foi fechada definitivamente e não aceita novos check-ins.</p>
            {hasListPanel && (
              <button type="button" className="button button-secondary" onClick={() => setActiveTab("list")}>
                Ver lista de presença ({entries.length})
              </button>
            )}
          </div>
        )
      ) : mode === "participant-ticket" ? (
        <div className="attendance-qr-center">
          {token && qrDataUri ? (
            <>
              <div className="my-ticket-qr attendance-qr-card">
                <img src={qrDataUri} alt={`Ticket QR para ${title}`} className="attendance-qr-image" />
                <span>Apresente este QR Code ao organizador na entrada do evento:</span>
                <code className="attendance-code-pill">{token}</code>
              </div>
              <div className="attendance-qr-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(token);
                    toast.success("Código do ticket copiado.");
                  }}
                >
                  Copiar código
                </button>
                {onGenerateToken && (
                  <button type="button" className="button button-secondary" disabled={busy} onClick={onGenerateToken}>
                    {busy ? "Atualizando…" : "Gerar novo QR"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="attendance-empty-qr">
              <p className="attendance-hint">Gerando seu QR Code de entrada…</p>
              {onGenerateToken && (
                <button type="button" className="button button-primary" disabled={busy} onClick={onGenerateToken}>
                  {busy ? "Gerando…" : "Gerar meu QR de entrada"}
                </button>
              )}
            </div>
          )}
        </div>
      ) : checkedIn ? (
        <div className="attendance-confirmed-box">
          <span className="sports-checked-badge">✓ Sua presença já está confirmada!</span>
        </div>
      ) : (
        <div className="sports-modal-stack">
          <p className="attendance-hint">
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
    </Modal>
  );
}
