import type { AttendanceMode, Event, EventStatus } from "../services/events.js";

const organizerLabels: Record<string, string> = {
  PROFESSOR: "Professor(a)",
  DEPARTMENT: "Departamento",
  ACADEMIC_UNIT: "Unidade acadêmica",
  UNIVERSITY: "Universidade",
  ACADEMIC_ENTITY: "Entidade acadêmica",
  COMMUNITY: "Comunidade",
};

const categoryLabels: Record<string, string> = {
  ACADEMIC: "Acadêmico",
  EXTENSION: "Extensão",
  CULTURE: "Cultura",
  SPORTS: "Esportes",
  SOCIAL: "Social",
};

export function organizerTypeLabel(organizerType: string): string {
  return organizerLabels[organizerType] ?? organizerType.replaceAll("_", " ");
}

export function eventCategoryLabel(category: string): string {
  const knownLabel = categoryLabels[category.toLocaleUpperCase("pt-BR")];
  if (knownLabel) return knownLabel;

  return category
    .replaceAll("_", " ")
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("pt-BR"));
}

export function eventStatusLabel(status: EventStatus): string {
  return status === "ACTIVE" ? "Ativo" : "Cancelado";
}

export function attendanceInstructions(mode?: AttendanceMode | null): string {
  if (mode === "PARTICIPANT_SCANS_EVENT") {
    return "Durante o evento, leia o QR Code exibido pela organização para registrar sua presença.";
  }
  if (mode === "ORGANIZER_SCANS_PARTICIPANT") {
    return "No local, apresente seu QR Code à organização. Sua presença será confirmada após a conferência.";
  }
  return "A organização informará como confirmar presença durante a atividade.";
}

export function filterEvents(
  events: Event[],
  options: {
    query: string;
    category: string;
    followedOrganizerKeys: ReadonlySet<string>;
    followedOnly: boolean;
  },
): Event[] {
  const query = options.query.trim().toLocaleLowerCase("pt-BR");

  return events.filter((event) => {
    if (options.category && event.category !== options.category) return false;
    if (options.followedOnly && !options.followedOrganizerKeys.has(`${event.organizerType}:${event.organizerId}`)) {
      return false;
    }
    if (!query) return true;

    const searchableText = [
      event.title,
      event.description,
      event.location,
      eventCategoryLabel(event.category),
      organizerTypeLabel(event.organizerType),
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR");

    return searchableText.includes(query);
  });
}
