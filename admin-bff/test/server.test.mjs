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

test("GET /api/v1/admin/me forwards bearer token to Campus", async (t) => {
  let forwardedUrl;
  let forwardedHeaders;
  const profile = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Ana Silva",
    institutionalId: "202420228",
    affiliationStatus: "PROFESSOR",
    academicLevel: "DOCTORATE",
    course: "Ciência da Computação",
    department: "Departamento de Ciência da Computação",
    interests: ["Sistemas Distribuídos"],
    createdAt: "2026-10-14T12:00:00Z",
    updatedAt: "2026-10-14T12:00:00Z",
    email: "admin@unir.edu.br",
    emailVerified: true,
  };
  const server = createServer({
    campusUrl: "http://campus:3000/",
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

  assert.equal(forwardedUrl, "http://campus:3000/users/me");
  assert.deepEqual(forwardedHeaders, { authorization: "Bearer valid.jwt.token" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), profile);
});

test("GET /api/v1/admin/me returns 503 when Campus is unavailable", async (t) => {
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
  assert.deepEqual(response.json(), { error: "Campus Service unavailable" });
});

test("GET /api/v1/admin/overview aggregates the administration view in one response", async (t) => {
  const requestedPaths = [];
  const server = createServer({
    campusUrl: "http://campus:3000",
    fetch: async (url) => {
      const path = new URL(String(url)).pathname;
      requestedPaths.push(path);
      const body = path === "/university" ? { id: "ufla", name: "UFLA" } : { items: [], totalElements: 0 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "GET",
    url: "/api/v1/admin/overview",
    headers: { authorization: "Bearer valid.jwt.token" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(requestedPaths.sort(), [
    "/academic-units",
    "/communities",
    "/courses",
    "/departments",
    "/entities",
    "/requests/pending",
    "/semesters",
    "/university",
    "/users",
  ]);
  assert.deepEqual(response.json().university, { id: "ufla", name: "UFLA" });
  assert.equal(response.json().pendingRequests.totalElements, 0);
});

test("POST /api/v1/admin/requests/:id/approve forwards the decision to Campus", async (t) => {
  let forwarded;
  const server = createServer({
    fetch: async (url, init) => {
      forwarded = { url: String(url), init };
      return new Response(JSON.stringify({ status: "APPROVED" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  t.after(() => server.close());

  const response = await server.inject({
    method: "POST",
    url: "/api/v1/admin/requests/request%201/approve",
    headers: { authorization: "Bearer valid.jwt.token" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(forwarded.url, "http://localhost:3000/requests/request%201/approve");
  assert.equal(forwarded.init.method, "POST");
  assert.equal(forwarded.init.headers.authorization, "Bearer valid.jwt.token");
});
