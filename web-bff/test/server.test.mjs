import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../dist/server.js";

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
      return new Response(JSON.stringify({ id: "user-123", name: "Gabriel Lima" }), {
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
  assert.deepEqual(response.json(), { id: "user-123", name: "Gabriel Lima" });
});

test("GET /api/v1/me requires a bearer token", async (t) => {
  const server = createServer({
    fetch: async () => {
      assert.fail("User Service should not be called without a token");
    },
  });
  t.after(() => server.close());

  const response = await server.inject({ method: "GET", url: "/api/v1/me" });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "A bearer token is required" });
});

test("GET /api/v1/me preserves User Service error status and body", async (t) => {
  const problem = { status: 404, detail: "User profile not found" };
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
    url: "/api/v1/me",
    headers: { authorization: "Bearer token" },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(response.headers["content-type"], "application/problem+json");
  assert.deepEqual(response.json(), problem);
});

test("GET /api/v1/me returns 503 when the User Service is unavailable", async (t) => {
  const server = createServer({
    fetch: async () => {
      throw new Error("connection refused");
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/me",
    headers: { authorization: "Bearer token" },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "User Service unavailable" });
});
