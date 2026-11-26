import { Modal } from "./Modal";

export interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel,
  cancelLabel = "Voltar",
  busy = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  return (
    <Modal eyebrow="Confirmação" title={title} size="sm" closeDisabled={busy} onClose={onClose}>
      <p style={{ margin: "0 0 1.25rem", lineHeight: 1.55 }}>{description}</p>
      <div className="sports-form-actions">
        <button className="button button-secondary" type="button" disabled={busy} onClick={onClose}>
          {cancelLabel}
        </button>
        <button className="button button-primary" type="button" disabled={busy} onClick={onConfirm}>
          {busy ? "Processando…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
