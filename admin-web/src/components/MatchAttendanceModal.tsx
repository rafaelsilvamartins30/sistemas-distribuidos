import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import type Keycloak from "keycloak-js";
import { useToast } from "../contexts/ToastContext";
import {
  createAdminSportsCheckinToken,
  reviewAdminMatchAttendance,
  type MatchAttendance,
  type SportsAdminMatch,
} from "../services/sportsAdmin";
import { extractErrorMessage } from "../utils/apiError";
import { AdminModal } from "./AdminModal";

export interface MatchAttendanceModalProps {
  gatewayUrl: string;
  keycloak: Keycloak;
  match: SportsAdminMatch;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

type AttendanceTab = "qr" | "list";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function MatchAttendanceModal({ gatewayUrl, keycloak, match, onChanged, onClose }: MatchAttendanceModalProps) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<AttendanceTab>(match.viewerCanManageQr ? "qr" : "list");
  const [token, setToken] = useState<string | null>(match.checkinToken ?? null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<MatchAttendance | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(match.checkinToken ?? null);
  }, [match.id, match.checkinToken]);

  useEffect(() => {
    let active = true;
    if (!token) {
      setQrImage(null);
      return;
    }
    void QRCode.toDataURL(token, { width: 260, margin: 2 })
      .then((url) => {
        if (active) setQrImage(url);
      })
      .catch(() => {
        if (active) setQrImage(null);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const loadAttendance = useCallback(async () => {
    setLoadingList(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão administrativa indisponível.");
      const data = await reviewAdminMatchAttendance(gatewayUrl, keycloak.token, match.id, false);
      setAttendance(data);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível carregar a lista de presença."));
    } finally {
      setLoadingList(false);
    }
  }, [gatewayUrl, keycloak, match.id, toast]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  async function handleGenerateQr() {
    setBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão administrativa indisponível.");
      const result = await createAdminSportsCheckinToken(gatewayUrl, keycloak.token, match.id);
      setToken(result.checkinToken);
      await onChanged();
      toast.success("QR Code de presença gerado.");
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível gerar o QR Code de presença."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseList() {
    setBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão administrativa indisponível.");
      const data = await reviewAdminMatchAttendance(gatewayUrl, keycloak.token, match.id, true);
      setAttendance(data);
      await onChanged();
      toast.success("Lista de presença fechada.");
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível fechar a lista de presença."));
    } finally {
      setBusy(false);
    }
  }

  function handleCopyList() {
    const entries = attendance?.entries ?? [];
    if (!entries.length) {
      toast.info("Nenhuma presença registrada para copiar.");
      return;
    }
    const header = `Lista de presença — ${match.homeTeamName} × ${match.awayTeamName} (${formatDateTime(match.scheduledAt)})`;
    const lines = entries.map((entry, idx) => `${idx + 1}. ${entry.name} — ${formatDateTime(entry.checkedInAt)}`);
    void navigator.clipboard?.writeText([header, ...lines].join("\n"));
    toast.success(`Lista com ${entries.length} presença(s) copiada.`);
  }

  const isClosed = Boolean(attendance?.closedAt);
  const canManageQr = match.viewerCanManageQr && !isClosed;
  const entries = attendance?.entries ?? [];
  const statusPill = isClosed ? (
    <span className="admin-status-pill is-ready">Lista fechada</span>
  ) : match.viewerCanReviewAttendance ? (
    <span className="admin-status-pill">Aguardando fechamento</span>
  ) : (
    <span className="admin-status-pill is-open">Check-in aberto</span>
  );

  return (
    <AdminModal
      elevated
      eyebrow="Presença da partida"
      title={`${match.homeTeamName} × ${match.awayTeamName}`}
      subtitle={`${match.roundLabel ?? `Rodada ${match.roundNumber}`} · ${formatDateTime(match.scheduledAt)} · ${match.location}`}
      badge={statusPill}
      closeDisabled={busy}
      onClose={onClose}
    >
      <div className="admin-modal-tabs" role="tablist" aria-label="Opções de presença">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "qr"}
          className={activeTab === "qr" ? "is-active" : ""}
          onClick={() => setActiveTab("qr")}
        >
          QR Code
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

      <div className="admin-dialog-content">
        {activeTab === "qr" ? (
          <div className="admin-sports-qr">
            {canManageQr ? (
              token && qrImage ? (
                <>
                  <img src={qrImage} alt="QR Code de presença da partida" width={240} height={240} />
                  <p className="admin-attendance-hint">
                    Apresente este QR Code ou informe o código abaixo para os atletas confirmarem presença:
                  </p>
                  <code className="admin-qr-code-box">{token}</code>
                  <div className="admin-dialog-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        void navigator.clipboard?.writeText(token);
                        toast.success("Código copiado para a área de transferência.");
                      }}
                    >
                      Copiar código
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => void handleGenerateQr()}
                    >
                      {busy ? "Gerando…" : "Gerar novo QR"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="admin-attendance-hint">
                    Gere o QR Code oficial desta partida para liberar o check-in dos atletas inscritos.
                  </p>
                  <button type="button" className="btn-primary" disabled={busy} onClick={() => void handleGenerateQr()}>
                    {busy ? "Gerando QR…" : "Gerar QR Code de presença"}
                  </button>
                </>
              )
            ) : (
              <div className="admin-attendance-closed-box">
                <strong>Check-in por QR Code encerrado</strong>
                <p>
                  {isClosed
                    ? "A lista de presença desta partida já foi fechada definitivamente."
                    : "Esta partida já foi concluída. Consulte ou feche a lista final na aba Lista de presença."}
                </p>
                <button type="button" className="btn-secondary" onClick={() => setActiveTab("list")}>
                  Ver lista de presença ({entries.length})
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="admin-attendance-panel">
            <div className="admin-attendance-toolbar">
              <span className="admin-attendance-summary">
                <strong>{entries.length}</strong> presença(s) registrada(s)
              </span>
              <div className="admin-attendance-toolbar-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loadingList || busy}
                  onClick={() => void loadAttendance()}
                >
                  {loadingList ? "Atualizando…" : "Atualizar"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loadingList || !entries.length}
                  onClick={handleCopyList}
                >
                  Copiar lista
                </button>
              </div>
            </div>

            {loadingList ? (
              <p className="admin-empty-note">Carregando presenças…</p>
            ) : entries.length > 0 ? (
              <ol className="admin-attendance-list">
                {entries.map((entry, index) => (
                  <li key={`${entry.name}-${entry.checkedInAt}-${index}`}>
                    <span>{entry.name}</span>
                    <small>{formatDateTime(entry.checkedInAt)}</small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="admin-empty-note">Nenhuma presença registrada até o momento.</p>
            )}

            <div className="admin-attendance-footer">
              {attendance?.closedAt ? (
                <p className="admin-success-message" role="status">
                  Lista fechada em {formatDateTime(attendance.closedAt)}.
                </p>
              ) : match.viewerCanReviewAttendance ? (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || loadingList}
                  onClick={() => void handleCloseList()}
                >
                  {busy ? "Fechando…" : "Fechar lista de presença"}
                </button>
              ) : (
                <p className="admin-attendance-hint">
                  As presenças aparecem aqui em tempo real. O fechamento definitivo fica disponível após o término da
                  partida.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminModal>
  );
}
