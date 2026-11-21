import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

const EVENT_WRITE_TIMEOUT_MS = 15_000;
const EVENT_QUERY_TIMEOUT_MS = 15_000;

interface ServerOptions {
  campusUrl?: string;
  engagementServiceUrl?: string;
  accessServiceUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createServer(options: ServerOptions = {}) {
  const campusUrl = (options.campusUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  const engagementServiceUrl = (options.engagementServiceUrl ?? "http://localhost:8080").replace(/\/+$/, "");
  const accessServiceUrl = (options.accessServiceUrl ?? "http://localhost:18087").replace(/\/+$/, "");
  const fetchCampus = options.fetch ?? globalThis.fetch;
  const fetchEngagementService = options.fetch ?? globalThis.fetch;
  const fetchAccessService = options.fetch ?? globalThis.fetch;
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({ status: "ok" }));

  async function forwardToCampus(
    request: FastifyRequest,
    reply: FastifyReply,
    method: "GET" | "POST" | "PATCH" | "DELETE",
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

    if (response.status === 204 || response.status === 304) {
      return reply.code(response.status).send();
    }

    return reply.code(response.status).send(body);
  }

  server.get("/api/v1/me", async (request, reply) => forwardToCampus(request, reply, "GET", "/users/me"));

  server.post("/api/v1/users", async (request, reply) => forwardToCampus(request, reply, "POST", "/users"));

  server.patch("/api/v1/me", async (request, reply) => forwardToCampus(request, reply, "PATCH", "/users/me"));

  server.get("/api/v1/web/university", async (request, reply) =>
    forwardToCampus(request, reply, "GET", "/university", "Campus unavailable", true),
  );

  server.patch("/api/v1/web/university", async (request, reply) =>
    forwardToCampus(request, reply, "PATCH", "/university", "Campus unavailable", true),
  );

  server.get("/api/v1/web/semesters", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/semesters${query}`, "Campus unavailable");
  });

  server.get<{ Params: { semesterId: string } }>("/api/v1/web/semesters/:semesterId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/semesters/${encodeURIComponent(request.params.semesterId)}`,
      "Campus unavailable",
    ),
  );

  server.post("/api/v1/web/semesters", async (request, reply) =>
    forwardToCampus(request, reply, "POST", "/semesters", "Campus unavailable"),
  );

  server.patch<{ Params: { semesterId: string } }>("/api/v1/web/semesters/:semesterId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
      `/semesters/${encodeURIComponent(request.params.semesterId)}`,
      "Campus unavailable",
    ),
  );

  server.get("/api/v1/web/academic-units", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/academic-units${query}`, "Campus unavailable", true);
  });

  server.get<{ Params: { unitId: string } }>("/api/v1/web/academic-units/:unitId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/academic-units/${encodeURIComponent(request.params.unitId)}`,
      "Campus unavailable",
      true,
    ),
  );

  server.post("/api/v1/web/academic-units", async (request, reply) =>
    forwardToCampus(request, reply, "POST", "/academic-units", "Campus unavailable", true),
  );

  server.patch<{ Params: { unitId: string } }>("/api/v1/web/academic-units/:unitId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
      `/academic-units/${encodeURIComponent(request.params.unitId)}`,
      "Campus unavailable",
      true,
    ),
  );

  server.get("/api/v1/web/courses", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/courses${query}`, "Campus unavailable");
  });

  server.get<{ Params: { courseId: string } }>("/api/v1/web/courses/:courseId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/courses/${encodeURIComponent(request.params.courseId)}`,
      "Campus unavailable",
    ),
  );

  server.post("/api/v1/web/courses", async (request, reply) =>
    forwardToCampus(request, reply, "POST", "/courses", "Campus unavailable"),
  );

  server.patch<{ Params: { courseId: string } }>("/api/v1/web/courses/:courseId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
      `/courses/${encodeURIComponent(request.params.courseId)}`,
      "Campus unavailable",
    ),
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

  server.post("/api/v1/web/departments", async (request, reply) =>
    forwardToCampus(request, reply, "POST", "/departments", "Campus unavailable", true),
  );

  server.patch<{ Params: { departmentId: string } }>("/api/v1/web/departments/:departmentId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
      `/departments/${encodeURIComponent(request.params.departmentId)}`,
      "Campus unavailable",
      true,
    ),
  );

  server.post("/api/v1/web/professor-verification-requests", async (request, reply) =>
    forwardToCampus(request, reply, "POST", "/professor-verification-requests", "Campus unavailable"),
  );

  server.get("/api/v1/web/professor-verification-requests/me", async (request, reply) =>
    forwardToCampus(request, reply, "GET", "/professor-verification-requests/me", "Campus unavailable"),
  );

  server.get<{ Params: { departmentId: string } }>(
    "/api/v1/web/departments/:departmentId/professor-verification-requests",
    async (request, reply) =>
      forwardToCampus(
        request,
        reply,
        "GET",
        `/departments/${encodeURIComponent(request.params.departmentId)}/professor-verification-requests`,
        "Campus unavailable",
      ),
  );

  server.post<{ Params: { requestId: string } }>(
    "/api/v1/web/professor-verification-requests/:requestId/approve",
    async (request, reply) =>
      forwardToCampus(
        request,
        reply,
        "POST",
        `/professor-verification-requests/${encodeURIComponent(request.params.requestId)}/approve`,
        "Campus unavailable",
      ),
  );

  server.get("/api/v1/web/requests/me", async (request, reply) =>
    forwardToCampus(request, reply, "GET", "/requests/me", "Campus unavailable"),
  );

  server.get("/api/v1/web/requests/pending", async (request, reply) =>
    forwardToCampus(request, reply, "GET", "/requests/pending", "Campus unavailable"),
  );

  server.post("/api/v1/web/requests", async (request, reply) =>
    forwardToCampus(request, reply, "POST", "/requests", "Campus unavailable"),
  );

  server.post<{ Params: { requestId: string } }>("/api/v1/web/requests/:requestId/approve", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "POST",
      `/requests/${encodeURIComponent(request.params.requestId)}/approve`,
      "Campus unavailable",
    ),
  );

  server.post<{ Params: { requestId: string } }>("/api/v1/web/requests/:requestId/reject", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "POST",
      `/requests/${encodeURIComponent(request.params.requestId)}/reject`,
      "Campus unavailable",
    ),
  );

  server.get("/api/v1/web/feed", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/feed${query}`, "Campus unavailable");
  });

  server.get<{ Params: { profileType: string; profileId: string } }>(
    "/api/v1/web/profiles/:profileType/:profileId/posts",
    async (request, reply) => {
      const query = new URL(request.url, "http://localhost").search;
      return forwardToCampus(
        request,
        reply,
        "GET",
        `/profiles/${encodeURIComponent(request.params.profileType)}/${encodeURIComponent(request.params.profileId)}/posts${query}`,
        "Campus unavailable",
      );
    },
  );

  server.post<{ Params: { profileType: string; profileId: string } }>(
    "/api/v1/web/profiles/:profileType/:profileId/posts",
    async (request, reply) =>
      forwardToCampus(
        request,
        reply,
        "POST",
        `/profiles/${encodeURIComponent(request.params.profileType)}/${encodeURIComponent(request.params.profileId)}/posts`,
        "Campus unavailable",
      ),
  );

  server.get<{ Params: { communityId: string } }>(
    "/api/v1/web/communities/:communityId/space/posts",
    async (request, reply) => {
      const query = new URL(request.url, "http://localhost").search;
      return forwardToCampus(
        request,
        reply,
        "GET",
        `/communities/${encodeURIComponent(request.params.communityId)}/space/posts${query}`,
        "Campus unavailable",
      );
    },
  );

  server.post<{ Params: { communityId: string } }>(
    "/api/v1/web/communities/:communityId/space/posts",
    async (request, reply) =>
      forwardToCampus(
        request,
        reply,
        "POST",
        `/communities/${encodeURIComponent(request.params.communityId)}/space/posts`,
        "Campus unavailable",
      ),
  );

  server.get<{ Params: { postId: string } }>(
    "/api/v1/web/community-space-posts/:postId/comments",
    async (request, reply) => {
      const query = new URL(request.url, "http://localhost").search;
      return forwardToCampus(
        request,
        reply,
        "GET",
        `/community-space-posts/${encodeURIComponent(request.params.postId)}/comments${query}`,
        "Campus unavailable",
      );
    },
  );

  server.post<{ Params: { postId: string } }>(
    "/api/v1/web/community-space-posts/:postId/comments",
    async (request, reply) =>
      forwardToCampus(
        request,
        reply,
        "POST",
        `/community-space-posts/${encodeURIComponent(request.params.postId)}/comments`,
        "Campus unavailable",
      ),
  );

  server.post<{ Params: { pollId: string } }>("/api/v1/web/polls/:pollId/votes", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "POST",
      `/polls/${encodeURIComponent(request.params.pollId)}/votes`,
      "Campus unavailable",
    ),
  );

  server.get("/api/v1/web/follows", async (request, reply) =>
    forwardToCampus(request, reply, "GET", "/follows", "Campus unavailable"),
  );

  server.post("/api/v1/web/follows", async (request, reply) =>
    forwardToCampus(request, reply, "POST", "/follows", "Campus unavailable"),
  );

  server.delete<{ Params: { followId: string } }>("/api/v1/web/follows/:followId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "DELETE",
      `/follows/${encodeURIComponent(request.params.followId)}`,
      "Campus unavailable",
    ),
  );

  server.get("/api/v1/web/notifications", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/notifications${query}`, "Campus unavailable");
  });

  server.post("/api/v1/web/notifications/read-all", async (request, reply) =>
    forwardToCampus(request, reply, "POST", "/notifications/read-all", "Campus unavailable"),
  );

  server.post<{ Params: { notificationId: string } }>(
    "/api/v1/web/notifications/:notificationId/read",
    async (request, reply) =>
      forwardToCampus(
        request,
        reply,
        "POST",
        `/notifications/${encodeURIComponent(request.params.notificationId)}/read`,
        "Campus unavailable",
      ),
  );

  server.post<{ Params: { requestId: string } }>(
    "/api/v1/web/professor-verification-requests/:requestId/reject",
    async (request, reply) =>
      forwardToCampus(
        request,
        reply,
        "POST",
        `/professor-verification-requests/${encodeURIComponent(request.params.requestId)}/reject`,
        "Campus unavailable",
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

  server.patch<{ Params: { entityId: string } }>("/api/v1/web/entities/:entityId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
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

  server.patch<{ Params: { communityId: string } }>("/api/v1/web/communities/:communityId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
      `/communities/${encodeURIComponent(request.params.communityId)}`,
      "Campus unavailable",
      true,
    ),
  );

  async function forwardToEngagementService(
    request: FastifyRequest,
    reply: FastifyReply,
    path: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
    timeoutMs = 5000,
  ) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
      return reply.code(401).send({ error: "A bearer token is required" });
    }

    let response: Response;
    let body: Buffer;
    const headers: Record<string, string> = { authorization };
    let requestBody: string | undefined;
    if ((method === "POST" || method === "PATCH") && request.body !== undefined) {
      headers["content-type"] = "application/json";
      requestBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    }
    try {
      response = await fetchEngagementService(`${engagementServiceUrl}${path}`, {
        method,
        headers,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(timeoutMs),
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
    return forwardToEngagementService(request, reply, `/api/v1/events${query}`, "GET", EVENT_QUERY_TIMEOUT_MS);
  });

  server.get("/api/v1/web/events/organizer-contexts", async (request, reply) =>
    forwardToEngagementService(request, reply, "/api/v1/events/organizer-contexts"),
  );

  server.get("/api/v1/web/events/managed", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToEngagementService(request, reply, `/api/v1/events/managed${query}`);
  });

  server.post("/api/v1/web/events", async (request, reply) =>
    forwardToEngagementService(request, reply, "/api/v1/events", "POST", EVENT_WRITE_TIMEOUT_MS),
  );

  server.get<{ Params: { eventId: string } }>("/api/v1/web/events/:eventId", async (request, reply) => {
    return forwardToEngagementService(
      request,
      reply,
      `/api/v1/events/${encodeURIComponent(request.params.eventId)}`,
      "GET",
      EVENT_QUERY_TIMEOUT_MS,
    );
  });

  server.patch<{ Params: { eventId: string } }>("/api/v1/web/events/:eventId", async (request, reply) =>
    forwardToEngagementService(
      request,
      reply,
      `/api/v1/events/${encodeURIComponent(request.params.eventId)}`,
      "PATCH",
      EVENT_WRITE_TIMEOUT_MS,
    ),
  );

  server.delete<{ Params: { eventId: string } }>("/api/v1/web/events/:eventId", async (request, reply) =>
    forwardToEngagementService(
      request,
      reply,
      `/api/v1/events/${encodeURIComponent(request.params.eventId)}`,
      "DELETE",
      EVENT_WRITE_TIMEOUT_MS,
    ),
  );

  server.get("/api/v1/web/opportunities", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToEngagementService(request, reply, `/api/v1/opportunities${query}`);
  });

  server.get("/api/v1/web/opportunities/publisher-contexts", async (request, reply) =>
    forwardToEngagementService(request, reply, "/api/v1/opportunities/publisher-contexts"),
  );

  server.get("/api/v1/web/opportunities/managed", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToEngagementService(request, reply, `/api/v1/opportunities/managed${query}`);
  });

  server.post("/api/v1/web/opportunities", async (request, reply) =>
    forwardToEngagementService(request, reply, "/api/v1/opportunities", "POST"),
  );

  server.get<{ Params: { opportunityId: string } }>(
    "/api/v1/web/opportunities/:opportunityId",
    async (request, reply) =>
      forwardToEngagementService(
        request,
        reply,
        `/api/v1/opportunities/${encodeURIComponent(request.params.opportunityId)}`,
      ),
  );

  server.patch<{ Params: { opportunityId: string } }>(
    "/api/v1/web/opportunities/:opportunityId",
    async (request, reply) =>
      forwardToEngagementService(
        request,
        reply,
        `/api/v1/opportunities/${encodeURIComponent(request.params.opportunityId)}`,
        "PATCH",
      ),
  );

  server.delete<{ Params: { opportunityId: string } }>(
    "/api/v1/web/opportunities/:opportunityId",
    async (request, reply) =>
      forwardToEngagementService(
        request,
        reply,
        `/api/v1/opportunities/${encodeURIComponent(request.params.opportunityId)}`,
        "DELETE",
      ),
  );

  server.get("/api/v1/web/sports", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToEngagementService(request, reply, `/api/v1/sports${query}`);
  });

  server.get<{ Params: { sportId: string } }>("/api/v1/web/sports/:sportId", async (request, reply) =>
    forwardToEngagementService(request, reply, `/api/v1/sports/${encodeURIComponent(request.params.sportId)}`),
  );

  server.get("/api/v1/web/competitions", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToEngagementService(request, reply, `/api/v1/competitions${query}`);
  });

  server.get<{ Params: { competitionId: string } }>("/api/v1/web/competitions/:competitionId", async (request, reply) =>
    forwardToEngagementService(
      request,
      reply,
      `/api/v1/competitions/${encodeURIComponent(request.params.competitionId)}`,
    ),
  );

  server.get("/api/v1/web/seasons", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToEngagementService(request, reply, `/api/v1/seasons${query}`);
  });

  server.get<{ Params: { seasonId: string } }>("/api/v1/web/seasons/:seasonId", async (request, reply) =>
    forwardToEngagementService(request, reply, `/api/v1/seasons/${encodeURIComponent(request.params.seasonId)}`),
  );

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

  server.get("/api/v1/web/me/tickets", async (request, reply) => {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
      return reply.code(401).send({ error: "A bearer token is required" });
    }
    try {
      const [registrationsResponse, ticketsResponse] = await Promise.all([
        fetchEngagementService(`${engagementServiceUrl}/api/v1/registrations/me?page=0&size=100`, {
          headers: { authorization },
          signal: AbortSignal.timeout(5000),
        }),
        fetchAccessService(`${accessServiceUrl}/api/v1/attendance/tickets/me`, {
          headers: { authorization },
          signal: AbortSignal.timeout(5000),
        }),
      ]);
      if (!registrationsResponse.ok) {
        const body = Buffer.from(await registrationsResponse.arrayBuffer());
        const contentType = registrationsResponse.headers.get("content-type");
        if (contentType) reply.header("content-type", contentType);
        return reply.code(registrationsResponse.status).send(body);
      }
      if (!ticketsResponse.ok) {
        const body = Buffer.from(await ticketsResponse.arrayBuffer());
        const contentType = ticketsResponse.headers.get("content-type");
        if (contentType) reply.header("content-type", contentType);
        return reply.code(ticketsResponse.status).send(body);
      }
      const registrations = (await registrationsResponse.json()) as { items?: unknown[] };
      const tickets = (await ticketsResponse.json()) as Array<{ registrationId?: string }>;
      if (!Array.isArray(registrations.items) || !Array.isArray(tickets)) {
        return reply.code(502).send({ error: "Ticket data is invalid" });
      }
      const attendanceByRegistration = new Map(
        tickets
          .filter((ticket) => typeof ticket.registrationId === "string")
          .map((ticket) => [ticket.registrationId as string, ticket]),
      );
      return {
        ...registrations,
        items: registrations.items.map((value) => {
          const registration = value as Record<string, unknown>;
          const registrationId = typeof registration.id === "string" ? registration.id : "";
          return { ...registration, attendance: attendanceByRegistration.get(registrationId) ?? null };
        }),
      };
    } catch (error) {
      request.log.error({ err: error }, "Ticket services request failed");
      return reply.code(503).send({ error: "Ticket services unavailable" });
    }
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

  async function forwardToAccessService(
    request: FastifyRequest,
    reply: FastifyReply,
    path: string,
    method: "GET" | "POST",
  ) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
      return reply.code(401).send({ error: "A bearer token is required" });
    }

    const headers: Record<string, string> = { authorization };
    let requestBody: string | undefined;
    if (method === "POST" && request.body !== undefined) {
      headers["content-type"] = "application/json";
      requestBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    }

    try {
      const response = await fetchAccessService(`${accessServiceUrl}${path}`, {
        method,
        headers,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(5000),
      });
      const body = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type");
      if (contentType) reply.header("content-type", contentType);
      return reply.code(response.status).send(body);
    } catch (error) {
      request.log.error({ err: error }, "Access Service request failed");
      return reply.code(503).send({ error: "Access Service unavailable" });
    }
  }

  server.get("/api/v1/web/attendance/me", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToAccessService(request, reply, `/api/v1/attendance/me${query}`, "GET");
  });

  server.post("/api/v1/web/attendance/check-ins", async (request, reply) =>
    forwardToAccessService(request, reply, "/api/v1/attendance/check-ins", "POST"),
  );

  server.get("/api/v1/web/attendance/tickets/me", async (request, reply) =>
    forwardToAccessService(request, reply, "/api/v1/attendance/tickets/me", "GET"),
  );

  server.post<{ Params: { eventId: string } }>("/api/v1/web/attendance/events/:eventId/qr", async (request, reply) =>
    forwardToAccessService(
      request,
      reply,
      `/api/v1/attendance/events/${encodeURIComponent(request.params.eventId)}/qr`,
      "POST",
    ),
  );

  server.post<{ Params: { eventId: string } }>("/api/v1/web/attendance/tickets/:eventId/qr", async (request, reply) =>
    forwardToAccessService(
      request,
      reply,
      `/api/v1/attendance/tickets/${encodeURIComponent(request.params.eventId)}/qr`,
      "POST",
    ),
  );

  server.post("/api/v1/web/attendance/organizer-check-ins/preview", async (request, reply) =>
    forwardToAccessService(request, reply, "/api/v1/attendance/organizer-check-ins/preview", "POST"),
  );

  server.post("/api/v1/web/attendance/organizer-check-ins/confirm", async (request, reply) =>
    forwardToAccessService(request, reply, "/api/v1/attendance/organizer-check-ins/confirm", "POST"),
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

  const viewerCanManage = (value as Record<string, unknown>).viewerCanManage === true;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => viewerCanManage || (key !== "administratorUserIds" && key !== "managerUserIds"))
      .map(([key, child]) => [key, withoutAdministrativeUserIds(child)]),
  );
}
