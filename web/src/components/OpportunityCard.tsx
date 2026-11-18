import { Link } from "react-router-dom";
import { Icon } from "./Icon.js";
import type { Opportunity } from "../services/opportunities.js";

const publisherLabels: Record<string, string> = {
  PROFESSOR: "Professor(a)",
  DEPARTMENT: "Departamento",
  ACADEMIC_ENTITY: "Entidade acadêmica",
};

function deadlineLabel(value?: string | null): string {
  if (!value) return "Prazo não informado";
  return `Inscrições até ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value))}`;
}

export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  return (
    <article className="content-card opportunity-list-card" data-opportunity-id={opportunity.id}>
      {opportunity.imageUrl && <img className="opportunity-list-image" src={opportunity.imageUrl} alt="" />}
      <div className="opportunity-list-topline">
        <span className="opportunity-type">{opportunity.category}</span>
        <span className="opportunity-publisher-type">
          {publisherLabels[opportunity.publisherType] ?? opportunity.publisherType}
        </span>
      </div>
      <h2>
        <Link to={`/oportunidades/${opportunity.id}`}>{opportunity.title}</Link>
      </h2>
      <p className="opportunity-description">{opportunity.description}</p>
      <div className="opportunity-list-meta">
        <span>
          <Icon name="calendar" width="16" height="16" />
          {deadlineLabel(opportunity.deadline)}
        </span>
        <span>
          <Icon name="shield" width="16" height="16" />
          Publicada por {publisherLabels[opportunity.publisherType] ?? opportunity.publisherType}
        </span>
      </div>
      <div className="opportunity-list-footer">
        <span>Inscrição no canal externo oficial</span>
        <Link className="button button-primary" to={`/oportunidades/${opportunity.id}`}>
          Ver oportunidade <Icon name="arrowUpRight" width="16" height="16" />
        </Link>
      </div>
    </article>
  );
}
