import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCard } from "../src/components/EventCard.js";
import {
  attendanceInstructions,
  eventCategoryLabel,
  filterEvents,
  organizerTypeLabel,
} from "../src/utils/eventPresentation.js";
import {
  EventApiError,
  cancelEvent,
  createEvent,
  getEvent,
  getEventOrganizerContexts,
  getEvents,
  getManagedEvents,
  updateEvent,
  type Event,
} from "../src/services/events.js";

const event: Event = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Encontro de Boas-vindas UNIR",
  description: "Encontro aberto para conhecer projetos e comunidades universitárias.",
  organizerType: "UNIVERSITY",
  organizerId: "20000000-0000-4000-8000-000000000001",
  imageUrl: null,
  location: "Auditório Central",
  startsAt: "2027-06-15T17:00:00Z",
  endsAt: "2027-06-15T19:00:00Z",
  category: "ACADEMIC",
  capacity: 120,
  registrationDeadline: "2027-06-14T23:59:00Z",
  registrationMode: "INTERNAL_FREE",
  price: null,
  externalUrl: null,
  attendanceEnabled: true,
  attendanceMode: "PARTICIPANT_SCANS_EVENT",
  status: "ACTIVE",
  createdAt: "2027-01-15T12:00:00Z",
};

test("getEvents queries the Gateway with the bearer token and returns persisted list data", async () => {
  const page = { items: [event], page: 0, size: 20, totalElements: 1, totalPages: 1 };
  let requestedUrl = "";
  let requestedHeaders: HeadersInit | undefined;

  const result = await getEvents("access-token", "http://localhost:18084/", async (url, init) => {
    requestedUrl = String(url);
    requestedHeaders = init?.headers;
    return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(requestedUrl, "http://localhost:18084/api/v1/web/events?page=0&size=20");
  assert.deepEqual(requestedHeaders, { Authorization: "Bearer access-token" });
  assert.deepEqual(result, page);
});

test("getEvent requests event detail and surfaces Gateway errors", async () => {
  let requestedUrl = "";
  const result = await getEvent("access-token", event.id, "http://localhost:18084", async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify(event), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(requestedUrl, `http://localhost:18084/api/v1/web/events/${event.id}`);
  assert.deepEqual(result, event);

  await assert.rejects(
    () =>
      getEvent("access-token", "missing", "http://localhost:18084", async () => new Response(null, { status: 404 })),
    (error: unknown) => error instanceof EventApiError && error.status === 404,
  );
});

test("EventCard presents values returned by the Engagement contract", () => {
  const markup = renderToStaticMarkup(createElement(EventCard, { event }));

  assert.match(markup, /Encontro de Boas-vindas UNIR/);
  assert.match(markup, /Encontro aberto para conhecer projetos/);
  assert.match(markup, /Auditório Central/);
  assert.match(markup, /Acadêmico/);
  assert.match(markup, /Universidade/);
  assert.doesNotMatch(markup, /ACADEMIC|UNIVERSITY/);
  assert.match(markup, /Gratuito/);
  assert.match(markup, /\/eventos\/10000000-0000-4000-8000-000000000001/);
});

test("event filters search user-facing fields and followed organizers", () => {
  const otherEvent = {
    ...event,
    id: "other",
    title: "Oficina de extensão",
    organizerType: "DEPARTMENT",
    location: "Sala de leitura",
  };
  const followedOrganizerKeys = new Set([`UNIVERSITY:${event.organizerId}`]);

  assert.deepEqual(
    filterEvents([event, otherEvent], {
      query: "auditório",
      category: "",
      followedOrganizerKeys,
      followedOnly: false,
    }).map((item) => item.id),
    [event.id],
  );
  assert.deepEqual(
    filterEvents([event, otherEvent], {
      query: "",
      category: "",
      followedOrganizerKeys,
      followedOnly: true,
    }).map((item) => item.id),
    [event.id],
  );
  assert.equal(eventCategoryLabel("EXTENSION"), "Extensão");
  assert.equal(organizerTypeLabel("ACADEMIC_ENTITY"), "Entidade acadêmica");
});

test("attendance instructions explain each QR flow without exposing internal modes", () => {
  const participantScans = attendanceInstructions("PARTICIPANT_SCANS_EVENT");
  const organizerScans = attendanceInstructions("ORGANIZER_SCANS_PARTICIPANT");

  assert.match(participantScans, /leia o QR Code exibido pela organização/i);
  assert.match(organizerScans, /apresente seu QR Code à organização/i);
  assert.doesNotMatch(`${participantScans} ${organizerScans}`, /PARTICIPANT_SCANS_EVENT|ORGANIZER_SCANS_PARTICIPANT/);
});

test("organizer contexts, create, update, and cancel event routes use the authenticated Gateway contract", async () => {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl: typeof globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    const payload = String(url).endsWith("/organizer-contexts")
      ? {
          items: [
            {
              organizerType: "DEPARTMENT",
              organizerId: event.organizerId,
              name: "DCC",
              paidRegistrationMode: "INTERNAL_PAID",
            },
          ],
        }
      : String(url).includes("/managed")
        ? { items: [event], page: 0, size: 20, totalElements: 1, totalPages: 1 }
        : init?.method === "DELETE"
          ? { ...event, status: "CANCELLED" }
          : event;
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };

  const contexts = await getEventOrganizerContexts("token", "http://localhost:18084", fetchImpl);
  assert.equal(contexts.items[0]?.paidRegistrationMode, "INTERNAL_PAID");
  await getManagedEvents("token", 0, 20, "http://localhost:18084", fetchImpl);
  await createEvent(
    "token",
    {
      title: event.title,
      description: event.description,
      organizerType: "DEPARTMENT",
      organizerId: event.organizerId,
      location: event.location,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      category: event.category,
      registrationDeadline: event.registrationDeadline,
      registrationMode: "INTERNAL_PAID",
      price: 2500,
    },
    "http://localhost:18084",
    fetchImpl,
  );
  await updateEvent("token", event.id, { title: "Novo título" }, "http://localhost:18084", fetchImpl);
  const cancelled = await cancelEvent("token", event.id, "http://localhost:18084", fetchImpl);
  assert.equal(cancelled.status, "CANCELLED");

  assert.deepEqual(calls, [
    { url: "http://localhost:18084/api/v1/web/events/organizer-contexts", method: "GET" },
    { url: "http://localhost:18084/api/v1/web/events/managed?page=0&size=20", method: "GET" },
    { url: "http://localhost:18084/api/v1/web/events", method: "POST" },
    { url: `http://localhost:18084/api/v1/web/events/${event.id}`, method: "PATCH" },
    { url: `http://localhost:18084/api/v1/web/events/${event.id}`, method: "DELETE" },
  ]);
});

test("event edits surface the Engagement validation code for the form", async () => {
  await assert.rejects(
    updateEvent("token", event.id, { endsAt: event.startsAt }, "http://localhost:18084", async () =>
      Response.json({ code: "EVENT_END_NOT_AFTER_START" }, { status: 400 }),
    ),
    (error) => error instanceof EventApiError && error.status === 400 && error.code === "EVENT_END_NOT_AFTER_START",
  );
});
