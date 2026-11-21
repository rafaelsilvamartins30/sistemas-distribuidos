import { useId, type ReactNode } from "react";

interface SectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function Section({ title, description, action, children }: SectionProps) {
  const headingId = useId();

  return (
    <section className="page-section" aria-labelledby={headingId}>
      <div className="page-section-heading">
        <div>
          <h2 id={headingId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
