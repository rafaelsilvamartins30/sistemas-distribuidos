import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../dist/server.js";

test("GET /health returns status ok for admin-bff", async (t) => {
  const server = createServer();
  t.after(() => server.close());

  const response = await server.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { service: "admin-bff", status: "ok" });
});

test("GET /api/v1/admin/me requires a bearer token", async (t) => {
  let called = false;
  const server = createServer({
    fetch: async () => {
      called = true;
      return new Response(null, { status: 200 });
    },
  });
  t.after(() => server.close());

  const response = await server.inject({ method: "GET", url: "/api/v1/admin/me" });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "A bearer token is required" });
  assert.equal(called, false);
});

test("GET /api/v1/admin/me forwards bearer token to User Service", async (t) => {
  let forwardedUrl;
  let forwardedHeaders;
  const profile = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@unir.edu.br",
    displayName: "Admin UNIR",
    status: "ACTIVE",
  };
  const server = createServer({
    userServiceUrl: "http://user-service:8080/",
    fetch: async (url, init) => {
      forwardedUrl = url;
      forwardedHeaders = init?.headers;
      return new Response(JSON.stringify(profile), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/admin/me",
    headers: { authorization: "Bearer valid.jwt.token" },
  });

  assert.equal(forwardedUrl, "http://user-service:8080/users/me");
  assert.deepEqual(forwardedHeaders, { authorization: "Bearer valid.jwt.token" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), profile);
});

test("GET /api/v1/admin/me returns 503 when User Service is unavailable", async (t) => {
  const server = createServer({
    fetch: async () => {
      throw new Error("connect ECONNREFUSED");
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/admin/me",
    headers: { authorization: "Bearer valid.jwt.token" },
  });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "User Service unavailable" });
});
