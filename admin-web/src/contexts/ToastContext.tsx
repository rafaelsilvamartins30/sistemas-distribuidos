import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "error" | "success" | "info";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  title?: string;
}

export interface ToastApi {
  show: (message: string, tone?: ToastTone, title?: string) => void;
  error: (message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  dismiss: (id: number) => void;
}

const NOOP_TOAST: ToastApi = {
  show: () => {},
  error: () => {},
  success: () => {},
  info: () => {},
  dismiss: () => {},
};

const ToastContext = createContext<ToastApi>(NOOP_TOAST);

const DEFAULT_TITLES: Record<ToastTone, string> = {
  error: "Não foi possível concluir",
  success: "Tudo certo",
  info: "Aviso",
};

const DEFAULT_DURATIONS_MS: Record<ToastTone, number> = {
  error: 9000,
  success: 5000,
  info: 5500,
};

const MAX_TOASTS = 5;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<Map<number, number>>(new Map());
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const clearTimer = useCallback((id: number) => {
    const handle = timersRef.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      setToasts((current) => current.filter((item) => item.id !== id));
    },
    [clearTimer],
  );

  const scheduleDismiss = useCallback(
    (id: number, tone: ToastTone) => {
      clearTimer(id);
      const handle = window.setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((current) => current.filter((item) => item.id !== id));
      }, DEFAULT_DURATIONS_MS[tone]);
      timersRef.current.set(id, handle);
    },
    [clearTimer],
  );

  const show = useCallback(
    (rawMessage: string, tone: ToastTone = "info", title?: string) => {
      const message = rawMessage.trim();
      if (!message) return;

      setToasts((current) => {
        const existing = current.find((item) => item.tone === tone && item.message === message);
        if (existing) {
          scheduleDismiss(existing.id, tone);
          return current;
        }
        const id = nextIdRef.current++;
        scheduleDismiss(id, tone);
        const next = [...current, { id, tone, message, ...(title ? { title } : {}) }];
        if (next.length > MAX_TOASTS) {
          const dropped = next.slice(0, next.length - MAX_TOASTS);
          dropped.forEach((item) => clearTimer(item.id));
          return next.slice(next.length - MAX_TOASTS);
        }
        return next;
      });
    },
    [clearTimer, scheduleDismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((handle) => window.clearTimeout(handle));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el || typeof el.showPopover !== "function") return;
    if (!el.hasAttribute("popover")) {
      el.setAttribute("popover", "manual");
    }
    if (toasts.length > 0) {
      try {
        el.hidePopover?.();
      } catch {
        // Ignore when popover is not yet open.
      }
      try {
        el.showPopover();
      } catch {
        // Ignore in environments where Popover API is unavailable.
      }
    } else {
      try {
        el.hidePopover?.();
      } catch {
        // Ignore when popover is already closed.
      }
    }
  }, [toasts]);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (message, title) => show(message, "error", title),
      success: (message, title) => show(message, "success", title),
      info: (message, title) => show(message, "info", title),
      dismiss,
    }),
    [dismiss, show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div ref={viewportRef} className="toast-viewport" aria-label="Notificações">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`toast-card toast-${item.tone}`}
            role={item.tone === "error" ? "alert" : "status"}
            aria-live={item.tone === "error" ? "assertive" : "polite"}
            onMouseEnter={() => clearTimer(item.id)}
            onMouseLeave={() => scheduleDismiss(item.id, item.tone)}
          >
            <span className="toast-icon" aria-hidden="true">
              {item.tone === "error" ? "!" : item.tone === "success" ? "✓" : "i"}
            </span>
            <div className="toast-body">
              <strong className="toast-title">{item.title ?? DEFAULT_TITLES[item.tone]}</strong>
              <p className="toast-message">{item.message}</p>
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Fechar notificação"
              onClick={() => dismiss(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
