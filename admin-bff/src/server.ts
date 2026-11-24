import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

interface ServerOptions {
  campusUrl?: string;
  engagementServiceUrl?: string;
  fetch?: typeof globalThis.fetch;
}

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  return typeof authorization === "string" && /^Bearer\s+\S+$/i.test(authorization) ? authorization : null;
}

export function createServer(options: ServerOptions = {}) {
  const campusUrl = (options.campusUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  const engagementServiceUrl = (options.engagementServiceUrl ?? "http://localhost:8080").replace(/\/+$/, "");
  const fetchService = options.fetch ?? globalThis.fetch;
  const server = Fastify({ logger: true });

  server.addHook("preValidation", async (request, reply) => {
    const params = request.params;
    if (params && typeof params === "object") {
      for (const value of Object.values(params as Record<string, unknown>)) {
        if (typeof value === "string" && (value === "." || value === "..")) {
          return reply.code(400).send({ error: "Invalid path parameter" });
        }
      }
    }
  });

  server.get("/health", async () => ({ service: "admin-bff", status: "ok" }));

  async function campusRequest(
    request: FastifyRequest,
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
    body?: unknown,
  ): Promise<Response | null> {
    const authorization = bearerToken(request);
    if (!authorization) return null;

    const headers: Record<string, string> = { authorization };
    const requestBody = body === undefined ? undefined : JSON.stringify(body);
    if (requestBody !== undefined) headers["content-type"] = "application/json";

    return fetchService(`${campusUrl}${path}`, {
      method,
      headers,
      ...(requestBody === undefined ? {} : { body: requestBody }),
      signal: AbortSignal.timeout(5000),
    });
  }

  async function engagementRequest(
    request: FastifyRequest,
    path: string,
    method: "GET" | "POST" | "PATCH" = "GET",
    body?: unknown,
  ): Promise<Response | null> {
    const authorization = bearerToken(request);
    if (!authorization) return null;

    const headers: Record<string, string> = { authorization };
    const requestBody = body === undefined ? undefined : JSON.stringify(body);
    if (requestBody !== undefined) headers["content-type"] = "application/json";

    return fetchService(`${engagementServiceUrl}${path}`, {
      method,
      headers,
      ...(requestBody === undefined ? {} : { body: requestBody }),
      signal: AbortSignal.timeout(5000),
    });
  }

  async function forwardToEngagement(
    request: FastifyRequest,
    reply: FastifyReply,
    path: string,
    method: "GET" | "POST" | "PATCH" = "GET",
  ) {
    if (!bearerToken(request)) return reply.code(401).send({ error: "A bearer token is required" });

    try {
      const response = (await engagementRequest(request, path, method, request.body)) as Response;
      const body = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type");
      if (contentType) reply.header("content-type", contentType);
      return reply.code(response.status).send(body);
    } catch (error) {
      request.log.error({ err: error }, "Engagement request failed");
      return reply.code(503).send({ error: "Engagement Service unavailable" });
    }
  }

  async function forwardToCampus(
    request: FastifyRequest,
    reply: FastifyReply,
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  ) {
    if (!bearerToken(request)) return reply.code(401).send({ error: "A bearer token is required" });

    let response: Response;
    let body: Buffer;
    try {
      response = (await campusRequest(request, path, method, request.body)) as Response;
      body = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      request.log.error({ err: error }, "Campus request failed");
      return reply.code(503).send({ error: "Campus Service unavailable" });
    }

    const contentType = response.headers.get("content-type");
    if (contentType) reply.header("content-type", contentType);
    return reply.code(response.status).send(body);
  }

  server.get("/api/v1/admin/me", async (request, reply) => forwardToCampus(request, reply, "/users/me"));

  server.get("/api/v1/admin/overview", async (request, reply) => {
    if (!bearerToken(request)) return reply.code(401).send({ error: "A bearer token is required" });

    const page = "?page=0&size=100&sort=name";
    try {
      const coreResponses = await Promise.all([
        campusRequest(request, "/university"),
        campusRequest(request, `/academic-units${page}`),
        campusRequest(request, `/departments${page}`),
        campusRequest(request, `/entities${page}`),
        campusRequest(request, `/communities${page}`),
        campusRequest(request, "/requests/pending?page=0&size=100"),
      ]);
      const failed = coreResponses.find((response) => response && !response.ok);
      if (failed) {
        const detail = Buffer.from(await failed.arrayBuffer());
        const contentType = failed.headers.get("content-type");
        if (contentType) reply.header("content-type", contentType);
        return reply.code(failed.status).send(detail);
      }

      const [university, academicUnits, departments, entities, communities, pendingRequests] = await Promise.all(
        coreResponses.map(async (response) => response?.json()),
      );

      // Optional directory enrichment (courses, semesters, users) for admin management forms
      const [coursesRes, semestersRes, usersRes] = await Promise.all([
        campusRequest(request, `/courses${page}`).catch(() => null),
        campusRequest(request, "/semesters?page=0&size=100").catch(() => null),
        campusRequest(request, "/users").catch(() => null),
      ]);
      const courses = coursesRes?.ok ? await coursesRes.json() : { items: [], totalElements: 0 };
      const semesters = semestersRes?.ok ? await semestersRes.json() : { items: [], totalElements: 0 };
      const users = usersRes?.ok ? await usersRes.json() : { items: [] };

      const unavailableSections = [
        !coursesRes?.ok && "courses",
        !semestersRes?.ok && "semesters",
        !usersRes?.ok && "users",
      ].filter(Boolean);

      return reply.send({
        unavailableSections,
        university,
        academicUnits,
        departments,
        entities,
        communities,
        pendingRequests,
        courses,
        semesters,
        users,
      });
    } catch (error) {
      request.log.error({ err: error }, "Campus overview aggregation failed");
      return reply.code(503).send({ error: "Campus Service unavailable" });
    }
  });

  for (const method of ["GET", "POST"] as const) {
    server.route<{ Params: { matchId: string } }>({
      method,
      url: "/api/v1/admin/sports-matches/:matchId/attendance",
      handler: (request, reply) =>
        forwardToEngagement(
          request,
          reply,
          `/api/v1/sports-matches/${encodeURIComponent(request.params.matchId)}/attendance`,
          method,
        ),
    });
  }

  server.get("/api/v1/admin/sports/catalog", async (request, reply) => {
    if (!bearerToken(request)) return reply.code(401).send({ error: "A bearer token is required" });

    const params = new URL(request.url, "http://localhost").searchParams;
    const section = params.get("section");
    const page = params.get("page") ?? "0";
    const catalogPath = (name: string) => {
      const selected = name === section;
      const size = selected ? "8" : !section || name === "sports" ? "100" : "1";
      return `/api/v1/${name}?${new URLSearchParams({ page: selected ? page : "0", size })}`;
    };
    const paths = [
      catalogPath("sports"),
      "/api/v1/sports/organizer-contexts",
      catalogPath("competitions"),
      catalogPath("seasons"),
    ];
    try {
      const responses = await Promise.all(paths.map((path) => engagementRequest(request, path)));
      const failed = responses.find((response) => response && !response.ok);
      if (failed) {
        const body = Buffer.from(await failed.arrayBuffer());
        const contentType = failed.headers.get("content-type");
        if (contentType) reply.header("content-type", contentType);
        return reply.code(failed.status).send(body);
      }
      const [sports, organizerContexts, competitions, seasons] = await Promise.all(
        responses.map(async (response) => response?.json()),
      );
      return reply.send({ sports, organizerContexts, competitions, seasons });
    } catch (error) {
      request.log.error({ err: error }, "Sports catalog aggregation failed");
      return reply.code(503).send({ error: "Engagement Service unavailable" });
    }
  });

  server.get<{ Params: { contextType: string; contextId: string } }>(
    "/api/v1/admin/sports-events/:contextType/:contextId/overview",
    async (request, reply) =>
      forwardToEngagement(
        request,
        reply,
        `/api/v1/sports-events/${encodeURIComponent(request.params.contextType)}/${encodeURIComponent(request.params.contextId)}/overview`,
      ),
  );

  server.post("/api/v1/admin/sports", async (request, reply) =>
    forwardToEngagement(request, reply, "/api/v1/sports", "POST"),
  );
  server.post("/api/v1/admin/competitions", async (request, reply) =>
    forwardToEngagement(request, reply, "/api/v1/competitions", "POST"),
  );
  server.post("/api/v1/admin/seasons", async (request, reply) =>
    forwardToEngagement(request, reply, "/api/v1/seasons", "POST"),
  );
  server.patch<{ Params: { contextType: string; contextId: string } }>(
    "/api/v1/admin/sports-events/:contextType/:contextId",
    async (request, reply) =>
      forwardToEngagement(
        request,
        reply,
        `/api/v1/sports-events/${encodeURIComponent(request.params.contextType)}/${encodeURIComponent(request.params.contextId)}`,
        "PATCH",
      ),
  );
  server.post<{ Params: { contextType: string; contextId: string } }>(
    "/api/v1/admin/sports-events/:contextType/:contextId/cancel",
    async (request, reply) =>
      forwardToEngagement(
        request,
        reply,
        `/api/v1/sports-events/${encodeURIComponent(request.params.contextType)}/${encodeURIComponent(request.params.contextId)}/cancel`,
        "POST",
      ),
  );
  server.post<{ Params: { contextType: string; contextId: string } }>(
    "/api/v1/admin/sports-events/:contextType/:contextId/matches/generate",
    async (request, reply) =>
      forwardToEngagement(
        request,
        reply,
        `/api/v1/sports-events/${encodeURIComponent(request.params.contextType)}/${encodeURIComponent(request.params.contextId)}/matches/generate`,
        "POST",
      ),
  );
  server.patch<{ Params: { matchId: string } }>("/api/v1/admin/sports-matches/:matchId/score", async (request, reply) =>
    forwardToEngagement(
      request,
      reply,
      `/api/v1/sports-matches/${encodeURIComponent(request.params.matchId)}/score`,
      "PATCH",
    ),
  );
  server.post<{ Params: { matchId: string } }>(
    "/api/v1/admin/sports-matches/:matchId/checkin-token",
    async (request, reply) =>
      forwardToEngagement(
        request,
        reply,
        `/api/v1/sports-matches/${encodeURIComponent(request.params.matchId)}/checkin-token`,
        "POST",
      ),
  );

  server.post("/api/v1/admin/academic-units", async (request, reply) =>
    forwardToCampus(request, reply, "/academic-units", "POST"),
  );
  server.post("/api/v1/admin/departments", async (request, reply) =>
    forwardToCampus(request, reply, "/departments", "POST"),
  );
  server.post("/api/v1/admin/courses", async (request, reply) => forwardToCampus(request, reply, "/courses", "POST"));
  server.post("/api/v1/admin/semesters", async (request, reply) =>
    forwardToCampus(request, reply, "/semesters", "POST"),
  );

  server.patch("/api/v1/admin/university", async (request, reply) =>
    forwardToCampus(request, reply, "/university", "PATCH"),
  );
  server.patch<{ Params: { semesterId: string } }>("/api/v1/admin/semesters/:semesterId", async (request, reply) =>
    forwardToCampus(request, reply, `/semesters/${encodeURIComponent(request.params.semesterId)}`, "PATCH"),
  );
  server.patch<{ Params: { unitId: string } }>("/api/v1/admin/academic-units/:unitId", async (request, reply) =>
    forwardToCampus(request, reply, `/academic-units/${encodeURIComponent(request.params.unitId)}`, "PATCH"),
  );
  server.patch<{ Params: { departmentId: string } }>(
    "/api/v1/admin/departments/:departmentId",
    async (request, reply) =>
      forwardToCampus(request, reply, `/departments/${encodeURIComponent(request.params.departmentId)}`, "PATCH"),
  );
  server.patch<{ Params: { entityId: string } }>("/api/v1/admin/entities/:entityId", async (request, reply) =>
    forwardToCampus(request, reply, `/entities/${encodeURIComponent(request.params.entityId)}`, "PATCH"),
  );
  server.patch<{ Params: { communityId: string } }>("/api/v1/admin/communities/:communityId", async (request, reply) =>
    forwardToCampus(request, reply, `/communities/${encodeURIComponent(request.params.communityId)}`, "PATCH"),
  );

  server.delete<{ Params: { unitId: string } }>("/api/v1/admin/academic-units/:unitId", async (request, reply) =>
    forwardToCampus(request, reply, `/academic-units/${encodeURIComponent(request.params.unitId)}`, "DELETE"),
  );
  server.delete<{ Params: { departmentId: string } }>(
    "/api/v1/admin/departments/:departmentId",
    async (request, reply) =>
      forwardToCampus(request, reply, `/departments/${encodeURIComponent(request.params.departmentId)}`, "DELETE"),
  );
  server.delete<{ Params: { courseId: string } }>("/api/v1/admin/courses/:courseId", async (request, reply) =>
    forwardToCampus(request, reply, `/courses/${encodeURIComponent(request.params.courseId)}`, "DELETE"),
  );
  server.delete<{ Params: { entityId: string } }>("/api/v1/admin/entities/:entityId", async (request, reply) =>
    forwardToCampus(request, reply, `/entities/${encodeURIComponent(request.params.entityId)}`, "DELETE"),
  );
  server.delete<{ Params: { communityId: string } }>("/api/v1/admin/communities/:communityId", async (request, reply) =>
    forwardToCampus(request, reply, `/communities/${encodeURIComponent(request.params.communityId)}`, "DELETE"),
  );

  server.post<{ Params: { requestId: string } }>("/api/v1/admin/requests/:requestId/approve", async (request, reply) =>
    forwardToCampus(request, reply, `/requests/${encodeURIComponent(request.params.requestId)}/approve`, "POST"),
  );

  server.post<{ Params: { requestId: string } }>("/api/v1/admin/requests/:requestId/reject", async (request, reply) =>
    forwardToCampus(request, reply, `/requests/${encodeURIComponent(request.params.requestId)}/reject`, "POST"),
  );

  return server;
}
