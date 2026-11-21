import type { Event } from "../services/events.js";
import { eventCategoryLabel, eventStatusLabel, organizerTypeLabel } from "../utils/eventPresentation.js";

function eventDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(value));
}

function eventTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function priceLabel(event: Event): string {
  if (event.registrationMode === "INTERNAL_FREE") return "Gratuito";
  if (event.price == null) return "Valor a consultar";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(event.price / 100);
}

export function EventCard({ event }: { event: Event }) {
  return (
    <article className="content-card event-catalog-card" data-event-id={event.id}>
      {event.imageUrl && <img className="event-catalog-image" src={event.imageUrl} alt="" />}
      <div className="event-catalog-card-top">
        <span className="event-kind-tag">{eventCategoryLabel(event.category)}</span>
        <span className="event-status">{eventStatusLabel(event.status)}</span>
      </div>
      <h3>
        <a href={`/eventos/${event.id}`}>{event.title}</a>
      </h3>
      <p className="event-catalog-description">{event.description}</p>
      <div className="event-catalog-meta">
        <span>
          <time dateTime={event.startsAt}>{eventDate(event.startsAt)}</time>
          {` · ${eventTime(event.startsAt)}–${eventTime(event.endsAt)}`}
        </span>
        <span>{event.location}</span>
        <span>{organizerTypeLabel(event.organizerType)}</span>
      </div>
      <div className="event-catalog-footer">
        <span>{priceLabel(event)}</span>
        <a className="button button-secondary" href={`/eventos/${event.id}`}>
          Ver evento
        </a>
      </div>
    </article>
  );
}
