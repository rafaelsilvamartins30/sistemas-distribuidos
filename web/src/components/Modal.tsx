import { useEffect, useId, type ReactNode } from "react";

export interface ModalProps {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  badge?: ReactNode;
  tabs?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeDisabled?: boolean;
  onClose: () => void;
  children: ReactNode;
}

const MAX_WIDTH_BY_SIZE: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "540px",
  md: "680px",
  lg: "860px",
};

export function Modal({
  title,
  eyebrow,
  subtitle,
  badge,
  tabs,
  size = "md",
  closeDisabled = false,
  onClose,
  children,
}: ModalProps) {
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
      className="sports-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) {
          onClose();
        }
      }}
    >
      <section
        className="sports-modal"
        style={{ maxWidth: MAX_WIDTH_BY_SIZE[size] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="sports-modal-header">
          <div className="modal-header-copy">
            {eyebrow && <p className="sports-kicker">{eyebrow}</p>}
            <div className="modal-title-row">
              <h2 id={titleId}>{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="sports-modal-close"
            aria-label="Fechar"
            disabled={closeDisabled}
            onClick={onClose}
          >
            ✕
          </button>
        </header>
        {tabs}
        <div className="sports-modal-body">{children}</div>
      </section>
    </div>
  );
}
