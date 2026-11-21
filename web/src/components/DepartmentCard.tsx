import { Link } from "react-router-dom";
import type { Department } from "../services/campus.js";

interface DepartmentCardProps {
  department: Department;
}

export function DepartmentCard({ department }: DepartmentCardProps) {
  return (
    <article className="entity-directory-card department-directory-card">
      <div className="entity-banner">
        <span>Departamento</span>
        <span className="entity-avatar-large" aria-hidden="true">
          {department.acronym}
        </span>
      </div>
      <div className="entity-directory-copy">
        <p className="eyebrow">{department.acronym}</p>
        <h3>
          <Link to={`/departamentos/${encodeURIComponent(department.id)}`}>{department.name}</Link>
        </h3>
        <p>{department.description}</p>
      </div>
    </article>
  );
}
