import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelRegistration,
  getMyRegistrations,
  registerForEvent,
  RegistrationApiError,
} from "../src/services/registrations.js";

const registration = {
  id: "30000000-0000-4000-8000-000000000001",
  eventId: "10000000-0000-4000-8000-000000000001",
  userId: "keycloak-subject",
  status: "CONFIRMED" as const,
  registeredAt: "2027-01-15T12:00:00Z",
  confirmedAt: "2027-01-15T12:00:00Z",
  cancelledAt: null,
  event: {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Encontro UNIR",
    description: "Evento persistido",
    organizerType: "UNIVERSITY",
    organizerId: "20000000-0000-4000-8000-000000000001",
    location: "Auditório Central",
    startsAt: "2027-06-15T17:00:00Z",
    endsAt: "2027-06-15T19:00:00Z",
    category: "ACADEMIC",
    capacity: 120,
    registrationDeadline: "2027-06-14T23:59:00Z",
    registrationMode: "INTERNAL_FREE",
    attendanceEnabled: true,
    status: "ACTIVE",
    createdAt: "2027-01-15T12:00:00Z",
  },
};

test("getMyRegistrations reads the authenticated activity endpoint", async () => {
  let requestedUrl = "";
  let requestHeaders: HeadersInit | undefined;
  const page = { items: [registration], page: 0, size: 100, totalElements: 1, totalPages: 1 };

  const result = await getMyRegistrations("access-token", "http://localhost:18084/", async (url, init) => {
    requestedUrl = String(url);
    requestHeaders = init?.headers;
    return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(requestedUrl, "http://localhost:18084/api/v1/web/me/activities?page=0&size=100");
  assert.deepEqual(requestHeaders, { Authorization: "Bearer access-token" });
  assert.deepEqual(result.items, [registration]);
});

test("registerForEvent sends no identity payload and returns the persisted registration", async () => {
  let requestedUrl = "";
  let requestMethod = "";
  let requestBody: BodyInit | null | undefined;

  const result = await registerForEvent(
    "access-token",
    registration.eventId,
    "http://localhost:18084",
    async (url, init) => {
      requestedUrl = String(url);
      requestMethod = String(init?.method);
      requestBody = init?.body;
      assert.deepEqual(init?.headers, { Authorization: "Bearer access-token" });
      return new Response(JSON.stringify(registration), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  );

  assert.equal(requestedUrl, `http://localhost:18084/api/v1/web/events/${registration.eventId}/registrations`);
  assert.equal(requestMethod, "POST");
  assert.equal(requestBody, undefined);
  assert.deepEqual(result, registration);
});

test("cancelRegistration uses logical cancellation and surfaces the domain conflict", async () => {
  let requestMethod = "";
  const cancelled = { ...registration, status: "CANCELLED_BY_USER" as const, cancelledAt: "2027-06-14T17:00:00Z" };
  const result = await cancelRegistration(
    "access-token",
    registration.id,
    "http://localhost:18084",
    async (_url, init) => {
      requestMethod = String(init?.method);
      return new Response(JSON.stringify(cancelled), { status: 200, headers: { "content-type": "application/json" } });
    },
  );
  assert.equal(requestMethod, "DELETE");
  assert.equal(result.status, "CANCELLED_BY_USER");

  await assert.rejects(
    () =>
      cancelRegistration(
        "access-token",
        registration.id,
        "http://localhost:18084",
        async () =>
          new Response(JSON.stringify({ status: 409, detail: "CANCELLATION_WINDOW_CLOSED" }), {
            status: 409,
            headers: { "content-type": "application/problem+json" },
          }),
      ),
    (error: unknown) =>
      error instanceof RegistrationApiError && error.status === 409 && error.detail === "CANCELLATION_WINDOW_CLOSED",
  );
});
