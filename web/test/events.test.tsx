import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCard } from "../src/components/EventCard.js";
import { EventApiError, getEvent, getEvents, type Event } from "../src/services/events.js";

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
  assert.match(markup, /ACADEMIC/);
  assert.match(markup, /Gratuito/);
  assert.match(markup, /\/eventos\/10000000-0000-4000-8000-000000000001/);
});
