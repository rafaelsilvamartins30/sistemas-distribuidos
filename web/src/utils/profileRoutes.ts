import type { InstitutionalProfileType } from "../services/campusSocial.js";

export type CampusProfileType = Extract<
  InstitutionalProfileType,
  "UNIVERSITY" | "ACADEMIC_UNIT" | "DEPARTMENT" | "ACADEMIC_ENTITY" | "COMMUNITY"
>;

const profileTypeSlugs: Record<CampusProfileType, string> = {
  UNIVERSITY: "universidade",
  ACADEMIC_UNIT: "unidade",
  DEPARTMENT: "departamento",
  ACADEMIC_ENTITY: "entidade",
  COMMUNITY: "comunidade",
};

export function campusProfilePath(type: CampusProfileType, id: string): string {
  return `/perfis/${profileTypeSlugs[type]}/${encodeURIComponent(id)}`;
}

export function campusProfileTypeFromSlug(value: string | undefined): CampusProfileType | null {
  if (value === "universidade") return "UNIVERSITY";
  if (value === "unidade") return "ACADEMIC_UNIT";
  if (value === "departamento") return "DEPARTMENT";
  if (value === "entidade") return "ACADEMIC_ENTITY";
  if (value === "comunidade") return "COMMUNITY";
  return null;
}

export function profileFilterPath(type: CampusProfileType | null): string {
  if (!type) return "/perfis";
  const filters: Record<CampusProfileType, string> = {
    UNIVERSITY: "universidade",
    ACADEMIC_UNIT: "unidades",
    DEPARTMENT: "departamentos",
    ACADEMIC_ENTITY: "entidades",
    COMMUNITY: "comunidades",
  };
  return `/perfis?tipo=${filters[type]}`;
}

export function campusProfileTypeFromFilter(value: string | null): CampusProfileType | null {
  if (value === "universidade") return "UNIVERSITY";
  if (value === "unidades") return "ACADEMIC_UNIT";
  if (value === "departamentos") return "DEPARTMENT";
  if (value === "entidades") return "ACADEMIC_ENTITY";
  if (value === "comunidades") return "COMMUNITY";
  return null;
}
