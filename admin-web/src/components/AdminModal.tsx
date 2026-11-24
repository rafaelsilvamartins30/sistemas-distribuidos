import { useEffect, useId, type ReactNode } from "react";

export interface AdminModalProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  badge?: ReactNode;
  size?: "default" | "wide";
  elevated?: boolean;
  closeDisabled?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function AdminModal({
  title,
  eyebrow,
  subtitle,
  badge,
  size = "default",
  elevated = false,
  closeDisabled = false,
  onClose,
  children,
}: AdminModalProps) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeDisabled) {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDisabled, onClose]);

  return (
    <div
      className={elevated ? "admin-dialog-backdrop admin-qr-backdrop" : "admin-dialog-backdrop"}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) {
          onClose();
        }
      }}
    >
      <section
        className={size === "wide" ? "admin-dialog admin-dialog-wide" : "admin-dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="admin-dialog-header">
          <div className="admin-dialog-heading">
            {eyebrow && <span className="admin-eyebrow">{eyebrow}</span>}
            <div className="admin-dialog-title-row">
              <h2 id={titleId}>{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="admin-dialog-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="admin-dialog-close"
            aria-label="Fechar"
            disabled={closeDisabled}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
