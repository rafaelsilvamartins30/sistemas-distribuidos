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

test("GET /api/v1/me forwards the JWT and returns the User Service response", async (t) => {
  const token = "Bearer eyJhbGciOiJIUzI1NiJ9.test.signature";
  const server = createServer({
    userServiceUrl: "http://user-service:8080/",
    fetch: async (url, options) => {
      assert.equal(url, "http://user-service:8080/users/me");
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
    userServiceUrl: "http://user-service:8080/",
    fetch: async (url, options) => {
      assert.equal(url, "http://user-service:8080/users");
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
    userServiceUrl: "http://user-service:8080/",
    fetch: async (url, options) => {
      assert.equal(url, "http://user-service:8080/users/me");
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
      assert.fail("User Service should not be called without a token");
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

test("GET /api/v1/me and PATCH /api/v1/me preserve User Service 404 status and body", async (t) => {
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

test("POST /api/v1/users preserves User Service 409 conflict and 400 validation errors", async (t) => {
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

test("GET /api/v1/me, POST /api/v1/users and PATCH /api/v1/me return 503 when the User Service is unavailable", async (t) => {
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
