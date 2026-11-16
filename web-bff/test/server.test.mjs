import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../dist/server.js";

const validProfile = {
  id: "user-123",
  name: "Gabriel Lima",
  institutionalId: "202420228",
  affiliationStatus: "STUDENT",
  academicLevel: "UNDERGRADUATE",
  course: "Sistemas de Informação",
  department: "DCC",
  interests: ["Sistemas distribuídos"],
  createdAt: "2026-10-14T12:00:00.000Z",
  updatedAt: "2026-10-14T12:00:00.000Z",
  email: "gabriel@unir.br",
  emailVerified: true,
};

const createPayload = {
  name: "Gabriel Lima",
  institutionalId: "202420228",
  affiliationStatus: "STUDENT",
  academicLevel: "UNDERGRADUATE",
  course: "Sistemas de Informação",
  department: "DCC",
  interests: ["Sistemas distribuídos"],
};

const updatePayload = {
  name: "Gabriel Martins",
  affiliationStatus: "ALUMNI",
  academicLevel: "MASTERS",
  course: "Ciência da Computação",
  department: "DCC",
  interests: ["Segurança"],
};

test("GET /health returns 200", async (t) => {
  const server = createServer();
  t.after(() => server.close());

  const response = await server.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("attendance routes forward the JWT and preserve Access responses", async (t) => {
  const token = "Bearer valid-access-token";
  const attendance = {
    eventId: "10000000-0000-4000-8000-000000000001",
    status: "ELIGIBLE",
    checkedAt: null,
  };
  const checkIn = {
    checkInId: "30000000-0000-4000-8000-000000000001",
    status: "ATTENDED",
  };
  let responseBody = attendance;
  const server = createServer({
    accessServiceUrl: "http://access:8080/",
    fetch: async (url, options) => {
      assert.equal(options.headers.authorization, token);
      if (options.method === "GET") {
        assert.equal(url, `http://access:8080/api/v1/attendance/me?eventId=${attendance.eventId}`);
      } else {
        assert.equal(url, "http://access:8080/api/v1/attendance/check-ins");
        assert.equal(options.headers["content-type"], "application/json");
        assert.deepEqual(JSON.parse(options.body), { token: "opaque-qr-token" });
      }
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const query = await server.inject({
    method: "GET",
    url: `/api/v1/web/attendance/me?eventId=${attendance.eventId}`,
    headers: { authorization: token },
  });
  assert.equal(query.statusCode, 200);
  assert.deepEqual(query.json(), attendance);

  responseBody = checkIn;
  const result = await server.inject({
    method: "POST",
    url: "/api/v1/web/attendance/check-ins",
    headers: { authorization: token, "content-type": "application/json" },
    payload: { token: "opaque-qr-token" },
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json(), checkIn);
});

test("attendance routes require a bearer token and report Access outages", async (t) => {
  const server = createServer({
    fetch: async () => {
      throw new Error("Access unavailable");
    },
  });
  t.after(() => server.close());

  const unauthorized = await server.inject({ method: "GET", url: "/api/v1/web/attendance/me?eventId=event-1" });
  assert.equal(unauthorized.statusCode, 401);

  const unavailable = await server.inject({
    method: "POST",
    url: "/api/v1/web/attendance/check-ins",
    headers: { authorization: "Bearer token" },
    payload: { token: "opaque-qr-token" },
  });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), { error: "Access Service unavailable" });
});

test("GET /api/v1/me forwards the JWT to Campus and returns its response", async (t) => {
  const token = "Bearer eyJhbGciOiJIUzI1NiJ9.test.signature";
  const server = createServer({
    campusUrl: "http://campus:3000/",
    fetch: async (url, options) => {
      assert.equal(url, "http://campus:3000/users/me");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.authorization, token);
      return new Response(JSON.stringify(validProfile), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: { authorization: token },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/json");
  assert.deepEqual(response.json(), validProfile);
});

test("POST /api/v1/users forwards the JWT and payload to POST /users and returns 201", async (t) => {
  const token = "Bearer eyJhbGciOiJIUzI1NiJ9.test.signature";
  const createdProfile = { ...validProfile };
  delete createdProfile.email;
  delete createdProfile.emailVerified;

  const server = createServer({
    campusUrl: "http://campus:3000/",
    fetch: async (url, options) => {
      assert.equal(url, "http://campus:3000/users");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.authorization, token);
      assert.equal(options.headers["content-type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), createPayload);
      return new Response(JSON.stringify(createdProfile), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/users",
    headers: { authorization: token, "content-type": "application/json" },
    payload: createPayload,
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.headers["content-type"], "application/json");
  assert.deepEqual(response.json(), createdProfile);
});

test("PATCH /api/v1/me forwards the JWT and payload to PATCH /users/me and returns 200", async (t) => {
  const token = "Bearer eyJhbGciOiJIUzI1NiJ9.test.signature";
  const updatedProfile = { ...validProfile, ...updatePayload };

  const server = createServer({
    campusUrl: "http://campus:3000/",
    fetch: async (url, options) => {
      assert.equal(url, "http://campus:3000/users/me");
      assert.equal(options.method, "PATCH");
      assert.equal(options.headers.authorization, token);
      assert.equal(options.headers["content-type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), updatePayload);
      return new Response(JSON.stringify(updatedProfile), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "PATCH",
    url: "/api/v1/me",
    headers: { authorization: token, "content-type": "application/json" },
    payload: updatePayload,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/json");
  assert.deepEqual(response.json(), updatedProfile);
});

test("GET /api/v1/me, POST /api/v1/users and PATCH /api/v1/me require a bearer token", async (t) => {
  const server = createServer({
    fetch: async () => {
      assert.fail("Campus should not be called without a token");
    },
  });
  t.after(() => server.close());

  for (const request of [
    { method: "GET", url: "/api/v1/me" },
    { method: "POST", url: "/api/v1/users", payload: createPayload },
    { method: "PATCH", url: "/api/v1/me", payload: updatePayload },
  ]) {
    const response = await server.inject(request);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "A bearer token is required" });
  }
});

test("GET /api/v1/me and PATCH /api/v1/me preserve Campus 404 status and body", async (t) => {
  const problem = { status: 404, detail: "UNIR user not found" };
  const server = createServer({
    fetch: async () =>
      new Response(JSON.stringify(problem), {
        status: 404,
        headers: { "content-type": "application/problem+json" },
      }),
  });
  t.after(() => server.close());

  for (const request of [
    { method: "GET", url: "/api/v1/me", headers: { authorization: "Bearer token" } },
    {
      method: "PATCH",
      url: "/api/v1/me",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      payload: updatePayload,
    },
  ]) {
    const response = await server.inject(request);
    assert.equal(response.statusCode, 404);
    assert.equal(response.headers["content-type"], "application/problem+json");
    assert.deepEqual(response.json(), problem);
  }
});

test("POST /api/v1/users preserves Campus 409 conflict and 400 validation errors", async (t) => {
  let statusToReturn = 409;
  let detailToReturn = "User already exists";
  const server = createServer({
    fetch: async () =>
      new Response(JSON.stringify({ status: statusToReturn, detail: detailToReturn }), {
        status: statusToReturn,
        headers: { "content-type": "application/problem+json" },
      }),
  });
  t.after(() => server.close());

  const conflictResponse = await server.inject({
    method: "POST",
    url: "/api/v1/users",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    payload: createPayload,
  });

  assert.equal(conflictResponse.statusCode, 409);
  assert.equal(conflictResponse.headers["content-type"], "application/problem+json");
  assert.deepEqual(conflictResponse.json(), { status: 409, detail: "User already exists" });

  statusToReturn = 400;
  detailToReturn = "Invalid fields: name";
  const badRequestResponse = await server.inject({
    method: "POST",
    url: "/api/v1/users",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    payload: { ...createPayload, name: "" },
  });

  assert.equal(badRequestResponse.statusCode, 400);
  assert.deepEqual(badRequestResponse.json(), { status: 400, detail: "Invalid fields: name" });
});

test("GET /api/v1/me, POST /api/v1/users and PATCH /api/v1/me return 503 when Campus is unavailable", async (t) => {
  const server = createServer({
    fetch: async () => {
      throw new Error("connection refused");
    },
  });
  t.after(() => server.close());

  for (const request of [
    { method: "GET", url: "/api/v1/me", headers: { authorization: "Bearer token" } },
    {
      method: "POST",
      url: "/api/v1/users",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      payload: createPayload,
    },
    {
      method: "PATCH",
      url: "/api/v1/me",
      headers: { authorization: "Bearer token", "content-type": "application/json" },
      payload: updatePayload,
    },
  ]) {
    const response = await server.inject(request);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { error: "User Service unavailable" });
  }
});

test("university and department reads forward JWTs and keep administrator IDs out of the Web response", async (t) => {
  const requested = [];
  const university = { id: "university-1", acronym: "UFRJ", currentTerm: "2026.2", links: [] };
  const department = {
    id: "department-1",
    acronym: "DCC",
    name: "Departamento de Ciência da Computação",
    administratorUserIds: ["admin-user-id"],
  };
  const server = createServer({
    campusUrl: "http://campus:3000/",
    fetch: async (url, options) => {
      requested.push({ url, options });
      const body = url.endsWith("/university")
        ? university
        : url.includes("department-1")
          ? department
          : { items: [department], page: 0, size: 20, totalElements: 1, totalPages: 1 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const headers = { authorization: "Bearer campus-token" };
  const universityResponse = await server.inject({ method: "GET", url: "/api/v1/web/university", headers });
  const listResponse = await server.inject({
    method: "GET",
    url: "/api/v1/web/departments?page=0&size=20&sort=name",
    headers,
  });
  const detailResponse = await server.inject({
    method: "GET",
    url: "/api/v1/web/departments/department-1",
    headers,
  });

  assert.deepEqual(universityResponse.json(), university);
  assert.equal(listResponse.json().items[0].acronym, "DCC");
  assert.equal("administratorUserIds" in listResponse.json().items[0], false);
  assert.equal(detailResponse.json().acronym, "DCC");
  assert.equal("administratorUserIds" in detailResponse.json(), false);
  assert.deepEqual(
    requested.map(({ url, options }) => [url, options.method, options.headers.authorization]),
    [
      ["http://campus:3000/university", "GET", "Bearer campus-token"],
      ["http://campus:3000/departments?page=0&size=20&sort=name", "GET", "Bearer campus-token"],
      ["http://campus:3000/departments/department-1", "GET", "Bearer campus-token"],
    ],
  );
});

test("university and department reads require a bearer token and return Campus errors", async (t) => {
  let requestedUrl = "";
  const server = createServer({
    campusUrl: "http://campus:3000",
    fetch: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ type: "about:blank", status: 404, detail: "Department not found" }), {
        status: 404,
        headers: { "content-type": "application/problem+json" },
      });
    },
  });
  t.after(() => server.close());

  const unauthorized = await server.inject({ method: "GET", url: "/api/v1/web/departments" });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(requestedUrl, "");

  const missing = await server.inject({
    method: "GET",
    url: "/api/v1/web/departments/missing-id",
    headers: { authorization: "Bearer campus-token" },
  });
  assert.equal(requestedUrl, "http://campus:3000/departments/missing-id");
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.headers["content-type"], "application/problem+json");
  assert.equal(missing.json().detail, "Department not found");
});

test("department list returns 503 when Campus is unavailable", async (t) => {
  const server = createServer({
    fetch: async () => {
      throw new Error("connection refused");
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/web/departments",
    headers: { authorization: "Bearer campus-token" },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "Campus unavailable" });
});

test("entity and community reads forward pagination and JWTs while hiding manager IDs", async (t) => {
  const requests = [];
  const record = {
    id: "entity-1",
    name: "Entidade de demonstração",
    managerUserIds: ["keycloak-manager-id"],
  };
  const server = createServer({
    campusUrl: "http://campus:3000/",
    fetch: async (url, options) => {
      requests.push([String(url), options]);
      return new Response(
        JSON.stringify({
          items: [record],
          page: 0,
          size: 20,
          totalElements: 1,
          totalPages: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  t.after(() => server.close());

  const headers = { authorization: "Bearer campus-token" };
  const entities = await server.inject({
    method: "GET",
    url: "/api/v1/web/entities?page=0&size=20&sort=name",
    headers,
  });
  const entity = await server.inject({ method: "GET", url: "/api/v1/web/entities/entity-1", headers });
  const communities = await server.inject({ method: "GET", url: "/api/v1/web/communities?page=1&size=5", headers });
  const community = await server.inject({ method: "GET", url: "/api/v1/web/communities/community-1", headers });

  for (const response of [entities, entity, communities, community]) {
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.stringify(response.json()).includes("managerUserIds"), false);
  }
  assert.deepEqual(
    requests.map(([url, options]) => [url, options.method, options.headers.authorization]),
    [
      ["http://campus:3000/entities?page=0&size=20&sort=name", "GET", "Bearer campus-token"],
      ["http://campus:3000/entities/entity-1", "GET", "Bearer campus-token"],
      ["http://campus:3000/communities?page=1&size=5", "GET", "Bearer campus-token"],
      ["http://campus:3000/communities/community-1", "GET", "Bearer campus-token"],
    ],
  );
});

test("entity and community reads require a bearer token and preserve Campus errors", async (t) => {
  let requestedUrl = "";
  const server = createServer({
    campusUrl: "http://campus:3000",
    fetch: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ status: 404, detail: "Community not found" }), {
        status: 404,
        headers: { "content-type": "application/problem+json" },
      });
    },
  });
  t.after(() => server.close());

  const unauthorized = await server.inject({ method: "GET", url: "/api/v1/web/entities" });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(requestedUrl, "");

  const missing = await server.inject({
    method: "GET",
    url: "/api/v1/web/communities/missing-id",
    headers: { authorization: "Bearer campus-token" },
  });
  assert.equal(requestedUrl, "http://campus:3000/communities/missing-id");
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.headers["content-type"], "application/problem+json");
  assert.equal(missing.json().detail, "Community not found");
});

test("event list and detail forward the bearer token to Engagement and preserve responses", async (t) => {
  const requested = [];
  const event = { id: "event-1", title: "Encontro UNIR", registrationMode: "INTERNAL_FREE" };
  const server = createServer({
    engagementServiceUrl: "http://engagement:8080/",
    fetch: async (url, options) => {
      requested.push({ url, options });
      const body = url.endsWith("/event-1")
        ? event
        : { items: [event], page: 0, size: 10, totalElements: 1, totalPages: 1 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const listResponse = await server.inject({
    method: "GET",
    url: "/api/v1/web/events?page=0&size=10",
    headers: { authorization: "Bearer event-token" },
  });
  const detailResponse = await server.inject({
    method: "GET",
    url: "/api/v1/web/events/event-1",
    headers: { authorization: "Bearer event-token" },
  });

  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.json().items, [event]);
  assert.equal(detailResponse.statusCode, 200);
  assert.deepEqual(detailResponse.json(), event);
  assert.deepEqual(
    requested.map(({ url, options }) => [url, options.method, options.headers.authorization]),
    [
      ["http://engagement:8080/api/v1/events?page=0&size=10", "GET", "Bearer event-token"],
      ["http://engagement:8080/api/v1/events/event-1", "GET", "Bearer event-token"],
    ],
  );
});

test("event routes require a bearer token and return 503 when Engagement is unavailable", async (t) => {
  const server = createServer({
    fetch: async () => {
      throw new Error("connection refused");
    },
  });
  t.after(() => server.close());

  const unauthorized = await server.inject({ method: "GET", url: "/api/v1/web/events" });
  assert.equal(unauthorized.statusCode, 401);
  assert.deepEqual(unauthorized.json(), { error: "A bearer token is required" });

  const unavailable = await server.inject({
    method: "GET",
    url: "/api/v1/web/events",
    headers: { authorization: "Bearer event-token" },
  });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), { error: "Engagement Service unavailable" });
});

test("event routes preserve Engagement problem responses", async (t) => {
  const problem = { type: "about:blank", status: 404, detail: "Event not found" };
  const server = createServer({
    fetch: async () =>
      new Response(JSON.stringify(problem), {
        status: 404,
        headers: { "content-type": "application/problem+json" },
      }),
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/web/events/event-1",
    headers: { authorization: "Bearer event-token" },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.headers["content-type"], "application/problem+json");
  assert.deepEqual(response.json(), problem);
});

test("registration operations forward the bearer token and preserve Engagement responses", async (t) => {
  const received = [];
  const registration = { id: "registration-1", eventId: "event-1", status: "CONFIRMED" };
  const server = createServer({
    engagementServiceUrl: "http://engagement:8080/",
    fetch: async (url, options) => {
      received.push({ url, options });
      if (options.method === "GET") {
        return new Response(
          JSON.stringify({ items: [registration], page: 0, size: 20, totalElements: 1, totalPages: 1 }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify(registration), {
        status: options.method === "POST" ? 201 : 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());
  const authorization = "Bearer event-token";

  const created = await server.inject({
    method: "POST",
    url: "/api/v1/web/events/event-1/registrations",
    headers: { authorization },
  });
  const listed = await server.inject({
    method: "GET",
    url: "/api/v1/web/me/activities?page=0&size=20",
    headers: { authorization },
  });
  const cancelled = await server.inject({
    method: "DELETE",
    url: "/api/v1/web/registrations/registration-1",
    headers: { authorization },
  });

  assert.equal(created.statusCode, 201);
  assert.equal(listed.statusCode, 200);
  assert.equal(cancelled.statusCode, 200);
  assert.deepEqual(listed.json().items, [registration]);
  assert.deepEqual(
    received.map(({ url, options }) => [url, options.method, options.headers.authorization]),
    [
      ["http://engagement:8080/api/v1/events/event-1/registrations", "POST", authorization],
      ["http://engagement:8080/api/v1/registrations/me?page=0&size=20", "GET", authorization],
      ["http://engagement:8080/api/v1/registrations/registration-1", "DELETE", authorization],
    ],
  );
});

test("registration operations require a bearer token and preserve conflict and unavailable errors", async (t) => {
  const problem = { type: "about:blank", status: 409, detail: "EVENT_FULL" };
  const server = createServer({
    fetch: async () =>
      new Response(JSON.stringify(problem), {
        status: 409,
        headers: { "content-type": "application/problem+json" },
      }),
  });
  t.after(() => server.close());

  const unauthorized = await server.inject({ method: "POST", url: "/api/v1/web/events/event-1/registrations" });
  assert.equal(unauthorized.statusCode, 401);

  const conflict = await server.inject({
    method: "POST",
    url: "/api/v1/web/events/event-1/registrations",
    headers: { authorization: "Bearer event-token" },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.headers["content-type"], "application/problem+json");
  assert.deepEqual(conflict.json(), problem);

  const unavailableServer = createServer({
    fetch: async () => {
      throw new Error("connection refused");
    },
  });
  t.after(() => unavailableServer.close());
  const unavailable = await unavailableServer.inject({
    method: "DELETE",
    url: "/api/v1/web/registrations/registration-1",
    headers: { authorization: "Bearer event-token" },
  });
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), { error: "Engagement Service unavailable" });
});
