import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

interface ServerOptions {
  campusUrl?: string;
  engagementServiceUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createServer(options: ServerOptions = {}) {
  const campusUrl = (options.campusUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  const engagementServiceUrl = (options.engagementServiceUrl ?? "http://localhost:8080").replace(/\/+$/, "");
  const fetchCampus = options.fetch ?? globalThis.fetch;
  const fetchEngagementService = options.fetch ?? globalThis.fetch;
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({ status: "ok" }));

  async function forwardToCampus(
    request: FastifyRequest,
    reply: FastifyReply,
    method: "GET" | "POST" | "PATCH",
    path: string,
    unavailableError = "User Service unavailable",
    hideAdministrativeUserIds = false,
  ) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
      return reply.code(401).send({ error: "A bearer token is required" });
    }

    const headers: Record<string, string> = { authorization };
    let requestBody: string | undefined;
    if (method !== "GET" && request.body !== undefined) {
      headers["content-type"] = "application/json";
      requestBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    }

    let response: Response;
    let body: Buffer;
    try {
      response = await fetchCampus(`${campusUrl}${path}`, {
        method,
        headers,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(5000),
      });
      body = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      request.log.error({ err: error }, "Campus request failed");
      return reply.code(503).send({ error: unavailableError });
    }

    if (hideAdministrativeUserIds && response.ok) {
      body = removeAdministrativeUserIds(body);
    }

    const contentType = response.headers.get("content-type");
    if (contentType) {
      reply.header("content-type", contentType);
    }

    return reply.code(response.status).send(body);
  }

  server.get("/api/v1/me", async (request, reply) => forwardToCampus(request, reply, "GET", "/users/me"));

  server.post("/api/v1/users", async (request, reply) => forwardToCampus(request, reply, "POST", "/users"));

  server.patch("/api/v1/me", async (request, reply) => forwardToCampus(request, reply, "PATCH", "/users/me"));

  server.get("/api/v1/web/university", async (request, reply) =>
    forwardToCampus(request, reply, "GET", "/university", "Campus unavailable"),
  );

  server.get("/api/v1/web/departments", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/departments${query}`, "Campus unavailable", true);
  });

  server.get<{ Params: { departmentId: string } }>("/api/v1/web/departments/:departmentId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/departments/${encodeURIComponent(request.params.departmentId)}`,
      "Campus unavailable",
      true,
    ),
  );

  server.get("/api/v1/web/entities", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/entities${query}`, "Campus unavailable", true);
  });

  server.get<{ Params: { entityId: string } }>("/api/v1/web/entities/:entityId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/entities/${encodeURIComponent(request.params.entityId)}`,
      "Campus unavailable",
      true,
    ),
  );

  server.get("/api/v1/web/communities", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/communities${query}`, "Campus unavailable", true);
  });

  server.get<{ Params: { communityId: string } }>("/api/v1/web/communities/:communityId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/communities/${encodeURIComponent(request.params.communityId)}`,
      "Campus unavailable",
      true,
    ),
  );

  async function forwardToEngagementService(
    request: FastifyRequest,
    reply: FastifyReply,
    path: string,
    method: "GET" | "POST" | "DELETE" = "GET",
  ) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
      return reply.code(401).send({ error: "A bearer token is required" });
    }

    let response: Response;
    let body: Buffer;
    const headers: Record<string, string> = { authorization };
    let requestBody: string | undefined;
    if (method === "POST" && request.body !== undefined) {
      headers["content-type"] = "application/json";
      requestBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    }
    try {
      response = await fetchEngagementService(`${engagementServiceUrl}${path}`, {
        method,
        headers,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(5000),
      });
      body = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      request.log.error({ err: error }, "Engagement Service request failed");
      return reply.code(503).send({ error: "Engagement Service unavailable" });
    }

    const contentType = response.headers.get("content-type");
    if (contentType) reply.header("content-type", contentType);
    return reply.code(response.status).send(body);
  }

  server.get("/api/v1/web/events", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToEngagementService(request, reply, `/api/v1/events${query}`);
  });

  server.get<{ Params: { eventId: string } }>("/api/v1/web/events/:eventId", async (request, reply) => {
    return forwardToEngagementService(request, reply, `/api/v1/events/${encodeURIComponent(request.params.eventId)}`);
  });

  server.post<{ Params: { eventId: string } }>("/api/v1/web/events/:eventId/registrations", async (request, reply) => {
    return forwardToEngagementService(
      request,
      reply,
      `/api/v1/events/${encodeURIComponent(request.params.eventId)}/registrations`,
      "POST",
    );
  });

  server.get("/api/v1/web/me/activities", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToEngagementService(request, reply, `/api/v1/registrations/me${query}`);
  });

  server.delete<{ Params: { registrationId: string } }>(
    "/api/v1/web/registrations/:registrationId",
    async (request, reply) =>
      forwardToEngagementService(
        request,
        reply,
        `/api/v1/registrations/${encodeURIComponent(request.params.registrationId)}`,
        "DELETE",
      ),
  );

  return server;
}

function removeAdministrativeUserIds(body: Buffer): Buffer {
  try {
    const value = JSON.parse(body.toString("utf8")) as unknown;
    return Buffer.from(JSON.stringify(withoutAdministrativeUserIds(value)));
  } catch {
    return body;
  }
}

function withoutAdministrativeUserIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAdministrativeUserIds);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "administratorUserIds" && key !== "managerUserIds")
      .map(([key, child]) => [key, withoutAdministrativeUserIds(child)]),
  );
}
