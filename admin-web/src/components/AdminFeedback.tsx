import type { ReactNode } from "react";

export function AdminFeedback({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  const className = tone === "error" ? "admin-alert" : tone === "success" ? "admin-success-message" : "admin-notice";
  return (
    <p className={className} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}
