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

test("GET /api/v1/web/me/tickets combines Engagement registrations with Access attendance", async (t) => {
  const registration = {
    id: "registration-1",
    eventId: "event-1",
    status: "CONFIRMED",
    canCancel: false,
    cancellationBlockedReason: "CANCELLATION_WINDOW_CLOSED",
    event: { id: "event-1", title: "Evento de teste" },
  };
  const attendance = { registrationId: "registration-1", status: "ATTENDED", checkedAt: "2027-06-15T18:00:00Z" };
  const server = createServer({
    engagementServiceUrl: "http://engagement:8080",
    accessServiceUrl: "http://access:8080",
    fetch: async (url, options) => {
      assert.equal(options.headers.authorization, "Bearer valid-token");
      if (String(url).startsWith("http://engagement:")) {
        assert.equal(url, "http://engagement:8080/api/v1/registrations/me?page=0&size=100");
        return new Response(
          JSON.stringify({ items: [registration], page: 0, size: 100, totalElements: 1, totalPages: 1 }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      assert.equal(url, "http://access:8080/api/v1/attendance/tickets/me");
      return new Response(JSON.stringify([attendance]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/web/me/tickets",
    headers: { authorization: "Bearer valid-token" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().items, [{ ...registration, attendance }]);
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

test("semester catalog reads are forwarded through Campus with the bearer token", async (t) => {
  const requested = [];
  const server = createServer({
    campusUrl: "http://campus:3000",
    fetch: async (url, options) => {
      requested.push([String(url), options.method, options.headers.authorization, options.body]);
      return new Response(
        JSON.stringify({ id: "semester-1", name: "2026/2", startOn: "2026-08-01", endOn: "2026-12-20" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });
  t.after(() => server.close());

  const headers = { authorization: "Bearer campus-token", "content-type": "application/json" };
  const list = await server.inject({ method: "GET", url: "/api/v1/web/semesters?page=0&size=100", headers });
  const detail = await server.inject({ method: "GET", url: "/api/v1/web/semesters/semester-1", headers });
  assert.equal(list.statusCode, 200);
  assert.equal(detail.statusCode, 200);
  assert.deepEqual(
    requested.map(([url, method, authorization]) => [url, method, authorization]),
    [
      ["http://campus:3000/semesters?page=0&size=100", "GET", "Bearer campus-token"],
      ["http://campus:3000/semesters/semester-1", "GET", "Bearer campus-token"],
    ],
  );
});

test("institutional and sports management mutations are not exposed by the Web BFF", async (t) => {
  let upstreamCalls = 0;
  const server = createServer({
    fetch: async () => {
      upstreamCalls += 1;
      return new Response(null, { status: 204 });
    },
  });
  t.after(() => server.close());

  const mutations = [
    ["PATCH", "/api/v1/web/university"],
    ["POST", "/api/v1/web/semesters"],
    ["PATCH", "/api/v1/web/semesters/semester-1"],
    ["POST", "/api/v1/web/academic-units"],
    ["POST", "/api/v1/web/departments"],
    ["POST", "/api/v1/web/sports"],
    ["POST", "/api/v1/web/competitions"],
    ["POST", "/api/v1/web/seasons"],
    ["POST", "/api/v1/web/sports-events/COMPETITION/event-1/cancel"],
    ["POST", "/api/v1/web/sports-events/COMPETITION/event-1/matches/generate"],
    ["PATCH", "/api/v1/web/sports-matches/match-1/score"],
    ["POST", "/api/v1/web/sports-matches/match-1/checkin-token"],
  ];

  for (const [method, url] of mutations) {
    const response = await server.inject({
      method,
      url,
      headers: { authorization: "Bearer user-token" },
      payload: {},
    });
    assert.equal(response.statusCode, 404, `${method} ${url}`);
  }
  assert.equal(upstreamCalls, 0);
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

test("academic unit and course catalogue queries forward pagination, filters, and bearer tokens", async (t) => {
  const requested = [];
  const server = createServer({
    campusUrl: "http://campus:3000/",
    fetch: async (url, options) => {
      requested.push([String(url), options.method, options.headers.authorization]);
      return new Response(JSON.stringify({ items: [], page: 0, size: 100, totalElements: 0, totalPages: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const headers = { authorization: "Bearer campus-token" };
  const unitList = await server.inject({
    method: "GET",
    url: "/api/v1/web/academic-units?page=0&size=100&sort=name",
    headers,
  });
  const unitDetail = await server.inject({ method: "GET", url: "/api/v1/web/academic-units/unit-1", headers });
  const courseList = await server.inject({
    method: "GET",
    url: "/api/v1/web/courses?page=0&size=100&sort=name&academicUnitId=unit-1",
    headers,
  });
  const courseDetail = await server.inject({ method: "GET", url: "/api/v1/web/courses/course-1", headers });

  assert.equal(unitList.statusCode, 200);
  assert.equal(unitDetail.statusCode, 200);
  assert.equal(courseList.statusCode, 200);
  assert.equal(courseDetail.statusCode, 200);
  assert.deepEqual(requested, [
    ["http://campus:3000/academic-units?page=0&size=100&sort=name", "GET", "Bearer campus-token"],
    ["http://campus:3000/academic-units/unit-1", "GET", "Bearer campus-token"],
    ["http://campus:3000/courses?page=0&size=100&sort=name&academicUnitId=unit-1", "GET", "Bearer campus-token"],
    ["http://campus:3000/courses/course-1", "GET", "Bearer campus-token"],
  ]);
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

test("Campus profile requests, feed, community conversations, follows, and notifications pass through the BFF", async (t) => {
  const requested = [];
  const server = createServer({
    campusUrl: "http://campus:3000/",
    fetch: async (url, options) => {
      requested.push({ url: String(url), options });
      const body = options.method === "DELETE" ? null : JSON.stringify({ items: [] });
      return new Response(body, {
        status: options.method === "DELETE" ? 204 : 200,
        headers: options.method === "DELETE" ? undefined : { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const token = "Bearer campus-social-token";
  const headers = { authorization: token, "content-type": "application/json" };
  const profilePatch = await server.inject({
    method: "PATCH",
    url: "/api/v1/web/departments/department-1",
    headers,
    payload: { name: "Departamento atualizado" },
  });
  const request = await server.inject({
    method: "POST",
    url: "/api/v1/web/requests",
    headers,
    payload: { type: "COMMUNITY_CREATION", targetDepartmentId: "department-1", payload: { name: "Clube" } },
  });
  const feed = await server.inject({ method: "GET", url: "/api/v1/web/feed?term=2026%2F2", headers });
  const profilePosts = await server.inject({
    method: "GET",
    url: "/api/v1/web/profiles/DEPARTMENT/department-1/posts?term=2026%2F2",
    headers,
  });
  const officialPost = await server.inject({
    method: "POST",
    url: "/api/v1/web/profiles/DEPARTMENT/department-1/posts",
    headers,
    payload: { body: "Aviso" },
  });
  const communityPost = await server.inject({
    method: "POST",
    url: "/api/v1/web/communities/community-1/space/posts",
    headers,
    payload: { body: "Conversa" },
  });
  const comment = await server.inject({
    method: "POST",
    url: "/api/v1/web/community-space-posts/post-1/comments",
    headers,
    payload: { body: "Comentário" },
  });
  const follows = await server.inject({ method: "GET", url: "/api/v1/web/follows", headers });
  const unfollow = await server.inject({
    method: "DELETE",
    url: "/api/v1/web/follows/follow-1",
    headers: { authorization: token },
  });
  const notifications = await server.inject({
    method: "GET",
    url: "/api/v1/web/notifications?unreadOnly=true",
    headers,
  });

  for (const response of [
    profilePatch,
    request,
    feed,
    profilePosts,
    officialPost,
    communityPost,
    comment,
    follows,
    notifications,
  ]) {
    assert.equal(response.statusCode, 200);
  }
  assert.equal(profilePatch.json().administratorUserIds, undefined);
  assert.equal(unfollow.statusCode, 204);
  assert.deepEqual(
    requested
      .filter(({ url }) => url.startsWith("http://campus:3000/"))
      .map(({ url, options }) => [url, options.method, options.headers.authorization]),
    [
      ["http://campus:3000/departments/department-1", "PATCH", token],
      ["http://campus:3000/requests", "POST", token],
      ["http://campus:3000/feed?term=2026%2F2", "GET", token],
      ["http://campus:3000/profiles/DEPARTMENT/department-1/posts?term=2026%2F2", "GET", token],
      ["http://campus:3000/profiles/DEPARTMENT/department-1/posts", "POST", token],
      ["http://campus:3000/communities/community-1/space/posts", "POST", token],
      ["http://campus:3000/community-space-posts/post-1/comments", "POST", token],
      ["http://campus:3000/follows", "GET", token],
      ["http://campus:3000/follows/follow-1", "DELETE", token],
      ["http://campus:3000/notifications?unreadOnly=true", "GET", token],
    ],
  );
});

test("Campus profile responses expose administrator subjects only to that profile's administrators", async (t) => {
  const server = createServer({
    campusUrl: "http://campus:3000",
    fetch: async () =>
      new Response(
        JSON.stringify({
          id: "department-1",
          viewerCanManage: true,
          administratorUserIds: ["admin-subject"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/web/departments/department-1",
    headers: { authorization: "Bearer campus-admin-token" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().administratorUserIds, ["admin-subject"]);
});

test("event list and detail forward the bearer token to Engagement and preserve responses", async (t) => {
  const originalTimeout = AbortSignal.timeout;
  const timeoutDurations = [];
  AbortSignal.timeout = (milliseconds) => {
    timeoutDurations.push(milliseconds);
    return originalTimeout(milliseconds);
  };
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
  t.after(async () => {
    AbortSignal.timeout = originalTimeout;
    await server.close();
  });

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
  assert.deepEqual(timeoutDurations, [15_000, 15_000]);
});

test("event mutations allow the Engagement write transaction up to 15 seconds", async (t) => {
  const originalTimeout = AbortSignal.timeout;
  const timeoutDurations = [];
  AbortSignal.timeout = (milliseconds) => {
    timeoutDurations.push(milliseconds);
    return originalTimeout(milliseconds);
  };
  const server = createServer({
    fetch: async () => new Response(JSON.stringify({ id: "event-1", status: "ACTIVE" }), { status: 200 }),
  });
  t.after(async () => {
    AbortSignal.timeout = originalTimeout;
    await server.close();
  });

  for (const request of [
    { method: "POST", url: "/api/v1/web/events", payload: { title: "Evento" } },
    { method: "PATCH", url: "/api/v1/web/events/event-1", payload: { title: "Evento atualizado" } },
    { method: "DELETE", url: "/api/v1/web/events/event-1" },
  ]) {
    const response = await server.inject({
      ...request,
      headers: { authorization: "Bearer event-token" },
    });
    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(timeoutDurations, [15_000, 15_000, 15_000]);
});

test("event mutation forwards Engagement validation as Problem Details", async (t) => {
  const problem = { status: 400, code: "EVENT_END_NOT_AFTER_START", detail: "endsAt must be after startsAt" };
  const server = createServer({
    fetch: async () => Response.json(problem, { status: 400, headers: { "content-type": "application/problem+json" } }),
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "PATCH",
    url: "/api/v1/web/events/event-1",
    headers: { authorization: "Bearer event-token" },
    payload: { endsAt: "2027-01-01T12:00:00Z" },
  });
  assert.equal(response.statusCode, 400);
  assert.match(response.headers["content-type"], /^application\/problem\+json/);
  assert.deepEqual(response.json(), problem);
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

test("opportunity list and detail forward filters and the bearer token to Engagement", async (t) => {
  const requested = [];
  const opportunity = { id: "opportunity-1", title: "Estágio em dados", publisherType: "DEPARTMENT" };
  const server = createServer({
    engagementServiceUrl: "http://engagement:8080/",
    fetch: async (url, options) => {
      requested.push([url, options.method, options.headers.authorization]);
      const body = url.includes("/opportunity-1")
        ? opportunity
        : { items: [opportunity], page: 0, size: 10, totalElements: 1, totalPages: 1 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const list = await server.inject({
    method: "GET",
    url: "/api/v1/web/opportunities?page=0&size=10&category=ESTAGIO&publisherType=DEPARTMENT&q=dados",
    headers: { authorization: "Bearer opportunity-token" },
  });
  const detail = await server.inject({
    method: "GET",
    url: "/api/v1/web/opportunities/opportunity-1",
    headers: { authorization: "Bearer opportunity-token" },
  });

  assert.equal(list.statusCode, 200);
  assert.deepEqual(list.json().items, [opportunity]);
  assert.equal(detail.statusCode, 200);
  assert.deepEqual(detail.json(), opportunity);
  assert.deepEqual(requested, [
    [
      "http://engagement:8080/api/v1/opportunities?page=0&size=10&category=ESTAGIO&publisherType=DEPARTMENT&q=dados",
      "GET",
      "Bearer opportunity-token",
    ],
    ["http://engagement:8080/api/v1/opportunities/opportunity-1", "GET", "Bearer opportunity-token"],
  ]);
});

test("POST /api/v1/web/rag/query forwards the user token and body to AI/RAG", async (t) => {
  const expected = {
    question: "Quais eventos de prototipação estão disponíveis?",
    top_k: 4,
    use_live_tool: false,
  };
  const server = createServer({
    ragServiceUrl: "http://ai-rag:8090/",
    fetch: async (url, options) => {
      assert.equal(url, "http://ai-rag:8090/api/v1/rag/query");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.authorization, "Bearer user-access-token");
      assert.equal(options.headers["content-type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), expected);
      return new Response(JSON.stringify({ generation_status: "FALLBACK_RETRIEVAL_ONLY", sources: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const unauthorized = await server.inject({ method: "POST", url: "/api/v1/web/rag/query", payload: expected });
  assert.equal(unauthorized.statusCode, 401);

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/web/rag/query",
    headers: { authorization: "Bearer user-access-token" },
    payload: expected,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().generation_status, "FALLBACK_RETRIEVAL_ONLY");
});

test("RAG query reports the downstream service outage", async (t) => {
  const server = createServer({
    fetch: async () => {
      throw new Error("RAG unavailable");
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/web/rag/query",
    headers: { authorization: "Bearer user-access-token" },
    payload: { question: "Quais eventos?" },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "AI/RAG Service unavailable" });
});

test("sports catalogue list and detail forward approved filters and the bearer token", async (t) => {
  const requested = [];
  const server = createServer({
    engagementServiceUrl: "http://engagement:8080",
    fetch: async (url, options) => {
      requested.push([url, options.method, options.headers.authorization]);
      return new Response(JSON.stringify({ items: [], page: 0, size: 10, totalElements: 0, totalPages: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const urls = [
    "/api/v1/web/sports?page=0&size=10&q=futsal",
    "/api/v1/web/sports/sport-1",
    "/api/v1/web/competitions?page=0&size=10&sportId=sport-1&targetTeamCount=16",
    "/api/v1/web/competitions/competition-1",
    "/api/v1/web/seasons?page=0&size=10&sportId=sport-1&targetTeamCount=10",
    "/api/v1/web/seasons/season-1",
  ];

  for (const url of urls) {
    const response = await server.inject({ method: "GET", url, headers: { authorization: "Bearer sports-token" } });
    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(requested, [
    ["http://engagement:8080/api/v1/sports?page=0&size=10&q=futsal", "GET", "Bearer sports-token"],
    ["http://engagement:8080/api/v1/sports/sport-1", "GET", "Bearer sports-token"],
    [
      "http://engagement:8080/api/v1/competitions?page=0&size=10&sportId=sport-1&targetTeamCount=16",
      "GET",
      "Bearer sports-token",
    ],
    ["http://engagement:8080/api/v1/competitions/competition-1", "GET", "Bearer sports-token"],
    [
      "http://engagement:8080/api/v1/seasons?page=0&size=10&sportId=sport-1&targetTeamCount=10",
      "GET",
      "Bearer sports-token",
    ],
    ["http://engagement:8080/api/v1/seasons/season-1", "GET", "Bearer sports-token"],
  ]);
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

test("opportunity publisher context and publication forward the caller token and request body", async (t) => {
  const token = "Bearer user-token";
  const context = { items: [{ publisherType: "DEPARTMENT", publisherId: "department-1", name: "DCC" }] };
  const created = { id: "opportunity-1", publisherType: "DEPARTMENT", publisherId: "department-1" };
  const received = [];
  const server = createServer({
    engagementServiceUrl: "http://engagement:8080/",
    fetch: async (url, options) => {
      received.push({ url, options });
      return new Response(JSON.stringify(options.method === "GET" ? context : created), {
        status: options.method === "GET" ? 200 : 201,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const contexts = await server.inject({
    method: "GET",
    url: "/api/v1/web/opportunities/publisher-contexts",
    headers: { authorization: token },
  });
  const payload = {
    title: "Estágio em software",
    description: "Atuação em serviços",
    publisherType: "DEPARTMENT",
    publisherId: "department-1",
    category: "ESTAGIO",
    externalUrl: "https://example.org/apply",
  };
  const publication = await server.inject({
    method: "POST",
    url: "/api/v1/web/opportunities",
    headers: { authorization: token, "content-type": "application/json" },
    payload,
  });

  assert.equal(contexts.statusCode, 200);
  assert.deepEqual(contexts.json(), context);
  assert.equal(publication.statusCode, 201);
  assert.deepEqual(publication.json(), created);
  assert.deepEqual(
    received.map(({ url, options }) => [url, options.method, options.headers.authorization]),
    [
      ["http://engagement:8080/api/v1/opportunities/publisher-contexts", "GET", token],
      ["http://engagement:8080/api/v1/opportunities", "POST", token],
    ],
  );
  assert.deepEqual(JSON.parse(received[1].options.body), payload);
});

test("professor verification and department review forward the JWT and preserve Campus responses", async (t) => {
  const token = "Bearer faculty-token";
  const departmentId = "department-1";
  const requestId = "request-1";
  const paths = [];
  const server = createServer({
    campusUrl: "http://campus:3000/",
    fetch: async (url, options) => {
      paths.push([url, options.method, options.headers.authorization]);
      return new Response(JSON.stringify({ status: "PENDING" }), {
        status: url.endsWith("/professor-verification-requests") && options.method === "POST" ? 201 : 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const created = await server.inject({
    method: "POST",
    url: "/api/v1/web/professor-verification-requests",
    headers: { authorization: token, "content-type": "application/json" },
    payload: { departmentId },
  });
  const mine = await server.inject({
    method: "GET",
    url: "/api/v1/web/professor-verification-requests/me",
    headers: { authorization: token },
  });
  const pending = await server.inject({
    method: "GET",
    url: `/api/v1/web/departments/${departmentId}/professor-verification-requests`,
    headers: { authorization: token },
  });
  const approved = await server.inject({
    method: "POST",
    url: `/api/v1/web/professor-verification-requests/${requestId}/approve`,
    headers: { authorization: token },
  });
  const rejected = await server.inject({
    method: "POST",
    url: `/api/v1/web/professor-verification-requests/${requestId}/reject`,
    headers: { authorization: token },
  });

  assert.equal(created.statusCode, 201);
  assert.equal(mine.statusCode, 200);
  assert.equal(pending.statusCode, 200);
  assert.equal(approved.statusCode, 200);
  assert.equal(rejected.statusCode, 200);
  assert.deepEqual(paths, [
    ["http://campus:3000/professor-verification-requests", "POST", token],
    ["http://campus:3000/professor-verification-requests/me", "GET", token],
    [`http://campus:3000/departments/${departmentId}/professor-verification-requests`, "GET", token],
    [`http://campus:3000/professor-verification-requests/${requestId}/approve`, "POST", token],
    [`http://campus:3000/professor-verification-requests/${requestId}/reject`, "POST", token],
  ]);

  const noToken = await server.inject({ method: "GET", url: "/api/v1/web/opportunities/publisher-contexts" });
  assert.equal(noToken.statusCode, 401);
});

test("payment list enriches events, teams and free agents with origin and readable metadata", async (t) => {
  const server = createServer({
    fetch: async (url, options) => {
      assert.equal(options.headers.authorization, "Bearer token");
      if (new URL(url).pathname === "/api/v1/payments/me") {
        return Response.json({ items: ["event", "team", "agent", "missing"].map((referenceId) => ({ referenceId })) });
      }
      assert.equal(new URL(url).pathname, "/api/v1/payment-references/me");
      return Response.json({
        event: {
          origin: "EVENT",
          title: "Semana de Computação",
          subtitle: "Inscrição em evento",
          targetPath: "/eventos/ev-1",
        },
        team: {
          origin: "SPORTS_TEAM",
          title: "Copa UFLA",
          subtitle: "Equipe · Raquetes",
          targetPath: "/esportes/campeonatos/comp-1",
        },
        agent: {
          origin: "SPORTS_FREE_AGENT",
          title: "Liga de Tênis",
          subtitle: "Inscrição individual (Free Agent)",
          targetPath: "/esportes/temporadas/season-1",
        },
      });
    },
  });
  t.after(() => server.close());
  const response = await server.inject({
    method: "GET",
    url: "/api/v1/web/payments/me",
    headers: { authorization: "Bearer token" },
  });
  assert.equal(response.statusCode, 200);
  const items = response.json().items;
  assert.deepEqual(
    items.map(({ origin }) => origin),
    ["EVENT", "SPORTS_TEAM", "SPORTS_FREE_AGENT", "UNKNOWN"],
  );
  assert.equal(items[0].title, "Semana de Computação");
  assert.equal(items[0].targetPath, "/eventos/ev-1");
  assert.equal(items[1].subtitle, "Equipe · Raquetes");
  assert.equal(items[3].title, undefined);
});

test("event links returned through the Web BFF use public Gateway paths", async (t) => {
  const server = createServer({
    fetch: async () =>
      Response.json({
        _links: {
          self: { href: "/api/v1/events/123", method: "GET" },
          cancel: { href: "/api/v1/events/123", method: "DELETE" },
        },
      }),
  });
  t.after(() => server.close());
  const response = await server.inject({
    method: "GET",
    url: "/api/v1/web/events/123",
    headers: { authorization: "Bearer token" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json()._links.self.href, "/api/v1/web/events/123");
  assert.deepEqual(response.json()._links.cancel, { href: "/api/v1/web/events/123", method: "DELETE" });
});

test("the organizer attendance action comes from Access", async (t) => {
  const action = { action: "SCAN_PARTICIPANT_QR" };
  const server = createServer({
    accessServiceUrl: "http://access:8080",
    fetch: async (url, init) => {
      assert.equal(url, "http://access:8080/api/v1/attendance/events/event-1/organizer-action");
      assert.equal(init.method, "GET");
      assert.equal(init.headers.authorization, "Bearer token");
      return Response.json(action);
    },
  });
  t.after(() => server.close());
  const response = await server.inject({
    method: "GET",
    url: "/api/v1/web/attendance/events/event-1/organizer-action",
    headers: { authorization: "Bearer token" },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), action);
});

test("attendance review uses Access authorization before resolving participant names in Campus", async (t) => {
  let campusCalls = 0;
  const server = createServer({
    accessServiceUrl: "http://access:8080",
    campusUrl: "http://campus:3000",
    fetch: async (url, init) => {
      const path = new URL(url);
      if (path.hostname === "access") {
        assert.equal(path.pathname, "/api/v1/attendance/events/event-1/attendance-review");
        if (init.headers.authorization !== "Bearer organizer") return Response.json({}, { status: 403 });
        assert.equal(init.method, "POST");
        return Response.json({
          entries: [{ userId: "participant", checkedInAt: "2027-01-01T12:00:00Z" }],
          closedAt: "2027-01-01T13:00:00Z",
        });
      }
      campusCalls++;
      assert.deepEqual(path.searchParams.getAll("subjects[]"), ["participant"]);
      return Response.json({ items: [{ keycloakUserId: "participant", name: "Marina Costa" }] });
    },
  });
  t.after(() => server.close());
  const url = "/api/v1/web/attendance/events/event-1/attendance-review";
  const denied = await server.inject({ method: "GET", url, headers: { authorization: "Bearer student" } });
  assert.equal(denied.statusCode, 403);
  assert.equal(campusCalls, 0);
  const closed = await server.inject({ method: "POST", url, headers: { authorization: "Bearer organizer" } });
  assert.equal(closed.statusCode, 200);
  assert.equal(closed.json().entries[0].name, "Marina Costa");
});

test("organizer check-in preview resolves participant display name from Campus", async (t) => {
  const server = createServer({
    accessServiceUrl: "http://access:8080",
    campusUrl: "http://campus:3000",
    fetch: async (url) => {
      const path = new URL(url);
      if (path.hostname === "access") {
        assert.equal(path.pathname, "/api/v1/attendance/organizer-check-ins/preview");
        return Response.json({
          eventId: "event-1",
          eventTitle: "Oficina UNIR",
          attendanceEntryId: "entry-1",
          registrationId: "reg-1",
          participantUserId: "participant-1",
          status: "ELIGIBLE",
        });
      }
      assert.equal(path.pathname, "/users");
      assert.deepEqual(path.searchParams.getAll("subjects[]"), ["participant-1"]);
      return Response.json({ items: [{ keycloakUserId: "participant-1", name: "Lucas Almeida" }] });
    },
  });
  t.after(() => server.close());
  const response = await server.inject({
    method: "POST",
    url: "/api/v1/web/attendance/organizer-check-ins/preview",
    headers: { authorization: "Bearer organizer" },
    payload: { token: "ticket-token-123" },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().participantName, "Lucas Almeida");
  assert.equal(response.json().participantUserId, "participant-1");
});

test("GET /api/v1/web/notifications syncs refunded payments to Campus before reading notifications", async (t) => {
  let syncedBody = null;
  const server = createServer({
    campusUrl: "http://campus:3000",
    paymentServiceUrl: "http://payment:8080",
    engagementServiceUrl: "http://engagement:8080",
    fetch: async (url, options = {}) => {
      const path = new URL(url);
      if (path.hostname === "payment") {
        return Response.json({
          items: [
            { id: "charge-1", referenceId: "reg-1", amountMinor: 2500, status: "REFUNDED" },
            { id: "charge-2", referenceId: "reg-2", amountMinor: 1000, status: "PAID" },
          ],
        });
      }
      if (path.hostname === "engagement") {
        return Response.json({
          "reg-1": { origin: "EVENT", title: "Mostra de protótipos", subtitle: "Inscrição em evento" },
        });
      }
      if (path.pathname === "/internal/v1/refund-notifications") {
        syncedBody = JSON.parse(options.body);
        return new Response(null, { status: 204 });
      }
      return Response.json({
        items: [
          {
            id: "notif-1",
            eventType: "PAYMENT_REFUNDED",
            title: "Estorno concluído",
            message: "R$ 25,00 estornados · Mostra de protótipos",
            resourceType: "PAYMENT",
            resourceId: "charge-1",
            readAt: null,
            createdAt: "2026-11-25T15:00:00Z",
          },
        ],
        unreadCount: 1,
      });
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/web/notifications",
    headers: { authorization: "Bearer buyer-token" },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(syncedBody, {
    items: [{ chargeId: "charge-1", amountMinor: 2500, label: "Mostra de protótipos" }],
  });
  assert.equal(response.json().unreadCount, 1);
  assert.equal(response.json().items[0].eventType, "PAYMENT_REFUNDED");
});
