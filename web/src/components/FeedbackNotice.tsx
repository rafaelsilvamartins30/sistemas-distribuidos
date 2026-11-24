import type { ReactNode } from "react";

export function FeedbackNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <p className={error ? "notice notice-error" : "notice"} role={error ? "alert" : "status"}>
      {children}
    </p>
  );
}
