import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

const EVENT_WRITE_TIMEOUT_MS = 15_000;
const EVENT_QUERY_TIMEOUT_MS = 15_000;
const RAG_QUERY_TIMEOUT_MS = 30_000;

interface ServerOptions {
  campusUrl?: string;
  engagementServiceUrl?: string;
  accessServiceUrl?: string;
  ragServiceUrl?: string;
  paymentServiceUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createServer(options: ServerOptions = {}) {
  const campusUrl = (options.campusUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  const engagementServiceUrl = (options.engagementServiceUrl ?? "http://localhost:8080").replace(/\/+$/, "");
  const accessServiceUrl = (options.accessServiceUrl ?? "http://localhost:18087").replace(/\/+$/, "");
  const ragServiceUrl = (options.ragServiceUrl ?? "http://localhost:8090").replace(/\/+$/, "");
  const paymentServiceUrl = (options.paymentServiceUrl ?? "http://localhost:18086").replace(/\/+$/, "");
  const fetchCampus = options.fetch ?? globalThis.fetch;
  const fetchEngagementService = options.fetch ?? globalThis.fetch;
  const fetchAccessService = options.fetch ?? globalThis.fetch;
  const fetchRagService = options.fetch ?? globalThis.fetch;
  const fetchPaymentService = options.fetch ?? globalThis.fetch;
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

  server.get("/health", async () => ({ status: "ok" }));

  async function forwardToCampus(
    request: FastifyRequest,
    reply: FastifyReply,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    unavailableError = "User Service unavailable",
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

  server.get("/api/v1/web/users", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/users${query}`, "Campus unavailable");
  });

  server.get("/api/v1/web/university", async (request, reply) =>
    forwardToCampus(request, reply, "GET", "/university", "Campus unavailable"),
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

  server.get("/api/v1/web/academic-units", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/academic-units${query}`, "Campus unavailable");
  });

  server.get<{ Params: { unitId: string } }>("/api/v1/web/academic-units/:unitId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/academic-units/${encodeURIComponent(request.params.unitId)}`,
      "Campus unavailable",
    ),
  );

  server.patch<{ Params: { unitId: string } }>("/api/v1/web/academic-units/:unitId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
      `/academic-units/${encodeURIComponent(request.params.unitId)}`,
      "Campus unavailable",
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

  server.get("/api/v1/web/departments", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/departments${query}`, "Campus unavailable");
  });

  server.get<{ Params: { departmentId: string } }>("/api/v1/web/departments/:departmentId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/departments/${encodeURIComponent(request.params.departmentId)}`,
      "Campus unavailable",
    ),
  );

  server.patch<{ Params: { departmentId: string } }>("/api/v1/web/departments/:departmentId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
      `/departments/${encodeURIComponent(request.params.departmentId)}`,
      "Campus unavailable",
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

  server.get("/api/v1/web/follows", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/follows${query}`, "Campus unavailable");
  });

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

  async function syncRefundNotifications(authorization: string): Promise<void> {
    try {
      const paymentsResponse = await fetchPaymentService(`${paymentServiceUrl}/api/v1/payments/me`, {
        headers: { authorization },
        signal: AbortSignal.timeout(2500),
      });
      if (!paymentsResponse.ok) return;
      const payload = (await paymentsResponse.json()) as {
        items?: Array<{ id?: string; referenceId?: string; amountMinor?: number; status?: string }>;
      };
      const refunded = (payload.items ?? []).filter(
        (charge) =>
          charge.status === "REFUNDED" &&
          typeof charge.id === "string" &&
          typeof charge.amountMinor === "number" &&
          charge.amountMinor > 0,
      );
      if (refunded.length === 0) return;

      type ReferenceMeta = string | { title?: string };
      const references = await fetchEngagementService(`${engagementServiceUrl}/api/v1/payment-references/me`, {
        headers: { authorization },
        signal: AbortSignal.timeout(2500),
      })
        .then(async (res) => (res.ok ? ((await res.json()) as Record<string, ReferenceMeta>) : null))
        .catch(() => null);

      const items = refunded.map((charge) => {
        const meta = typeof charge.referenceId === "string" ? references?.[charge.referenceId] : undefined;
        const label = typeof meta === "object" && meta?.title ? meta.title : undefined;
        return { chargeId: charge.id, amountMinor: charge.amountMinor, ...(label ? { label } : {}) };
      });

      await fetchCampus(`${campusUrl}/internal/v1/refund-notifications`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({ items }),
        signal: AbortSignal.timeout(2500),
      });
    } catch {
      // Best-effort sync; Campus notifications remain available even if Payment is temporarily unreachable.
    }
  }

  server.get("/api/v1/web/notifications", async (request, reply) => {
    const authorization = request.headers.authorization;
    if (typeof authorization === "string" && /^Bearer\s+\S+$/i.test(authorization)) {
      await syncRefundNotifications(authorization);
    }
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
    return forwardToCampus(request, reply, "GET", `/entities${query}`, "Campus unavailable");
  });

  server.get<{ Params: { entityId: string } }>("/api/v1/web/entities/:entityId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/entities/${encodeURIComponent(request.params.entityId)}`,
      "Campus unavailable",
    ),
  );

  server.patch<{ Params: { entityId: string } }>("/api/v1/web/entities/:entityId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
      `/entities/${encodeURIComponent(request.params.entityId)}`,
      "Campus unavailable",
    ),
  );

  server.get("/api/v1/web/communities", async (request, reply) => {
    const query = new URL(request.url, "http://localhost").search;
    return forwardToCampus(request, reply, "GET", `/communities${query}`, "Campus unavailable");
  });

  server.get<{ Params: { communityId: string } }>("/api/v1/web/communities/:communityId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "GET",
      `/communities/${encodeURIComponent(request.params.communityId)}`,
      "Campus unavailable",
    ),
  );

  server.patch<{ Params: { communityId: string } }>("/api/v1/web/communities/:communityId", async (request, reply) =>
    forwardToCampus(
      request,
      reply,
      "PATCH",
      `/communities/${encodeURIComponent(request.params.communityId)}`,
      "Campus unavailable",
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
    if (response.ok && contentType?.includes("json") && /^\/api\/v1\/events(?:[/?]|$)/.test(path)) {
      const payload = JSON.parse(body.toString("utf8"), (key, value: unknown) =>
        key === "href" && typeof value === "string" && /^\/api\/v1\/events(?:[/?]|$)/.test(value)
          ? value.replace("/api/v1/events", "/api/v1/web/events")
          : value,
      );
      if (contentType) reply.header("content-type", contentType);
      return reply.code(response.status).send(payload);
    }
    if (contentType) reply.header("content-type", contentType);
    return reply.code(response.status).send(body);
  }

  server.post("/api/v1/web/rag/query", async (request, reply) => {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
      return reply.code(401).send({ error: "A bearer token is required" });
    }

    const headers: Record<string, string> = { authorization, "content-type": "application/json" };
    const requestBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
    try {
      const response = await fetchRagService(`${ragServiceUrl}/api/v1/rag/query`, {
        method: "POST",
        headers,
        body: requestBody,
        signal: AbortSignal.timeout(RAG_QUERY_TIMEOUT_MS),
      });
      const body = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type");
      if (contentType) reply.header("content-type", contentType);
      return reply.code(response.status).send(body);
    } catch (error) {
      request.log.error({ err: error }, "AI/RAG Service request failed");
      return reply.code(503).send({ error: "AI/RAG Service unavailable" });
    }
  });

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

  server.get<{ Params: { contextType: string; contextId: string } }>(
    "/api/v1/web/sports-events/:contextType/:contextId/overview",
    async (request, reply) =>
      forwardToEngagementService(
        request,
        reply,
        `/api/v1/sports-events/${encodeURIComponent(request.params.contextType)}/${encodeURIComponent(request.params.contextId)}/overview`,
      ),
  );

  server.post<{ Params: { contextType: string; contextId: string } }>(
    "/api/v1/web/sports-events/:contextType/:contextId/teams",
    async (request, reply) =>
      forwardToEngagementService(
        request,
        reply,
        `/api/v1/sports-events/${encodeURIComponent(request.params.contextType)}/${encodeURIComponent(request.params.contextId)}/teams`,
        "POST",
      ),
  );

  server.post<{ Params: { contextType: string; contextId: string } }>(
    "/api/v1/web/sports-events/:contextType/:contextId/teams/join",
    async (request, reply) =>
      forwardToEngagementService(
        request,
        reply,
        `/api/v1/sports-events/${encodeURIComponent(request.params.contextType)}/${encodeURIComponent(request.params.contextId)}/teams/join`,
        "POST",
      ),
  );

  server.post<{ Params: { contextType: string; contextId: string } }>(
    "/api/v1/web/sports-events/:contextType/:contextId/free-agents",
    async (request, reply) =>
      forwardToEngagementService(
        request,
        reply,
        `/api/v1/sports-events/${encodeURIComponent(request.params.contextType)}/${encodeURIComponent(request.params.contextId)}/free-agents`,
        "POST",
      ),
  );

  server.get("/api/v1/web/sports-events/me", async (request, reply) =>
    forwardToEngagementService(request, reply, "/api/v1/sports-events/me"),
  );

  server.get("/api/v1/web/sports-matches/me", async (request, reply) =>
    forwardToEngagementService(request, reply, "/api/v1/sports-matches/me"),
  );

  async function forwardToPaymentService(
    request: FastifyRequest,
    reply: FastifyReply,
    path: string,
    method: "GET" | "POST" = "GET",
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
      const response = await fetchPaymentService(`${paymentServiceUrl}${path}`, {
        method,
        headers,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(5000),
      });
      if (path === "/api/v1/payments/me" && response.ok) {
        const payload = (await response.json()) as { items: { referenceId: string }[] };
        type ReferenceMeta = string | { origin?: string; title?: string; subtitle?: string; targetPath?: string };
        const references = await fetchEngagementService(`${engagementServiceUrl}/api/v1/payment-references/me`, {
          headers,
          signal: AbortSignal.timeout(5000),
        })
          .then(async (result) => (result.ok ? ((await result.json()) as Record<string, ReferenceMeta>) : null))
          .catch(() => null);
        return reply.code(response.status).send({
          ...payload,
          items: payload.items.map((charge) => {
            const meta = references?.[charge.referenceId];
            if (typeof meta === "string") {
              return { ...charge, origin: meta };
            }
            return {
              ...charge,
              origin: meta?.origin ?? "UNKNOWN",
              ...(meta?.title ? { title: meta.title } : {}),
              ...(meta?.subtitle ? { subtitle: meta.subtitle } : {}),
              ...(meta?.targetPath ? { targetPath: meta.targetPath } : {}),
            };
          }),
        });
      }
      const body = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type");
      if (contentType) reply.header("content-type", contentType);
      return reply.code(response.status).send(body);
    } catch (error) {
      request.log.error({ err: error }, "Payment Service request failed");
      return reply.code(503).send({ error: "Payment Service unavailable" });
    }
  }

  server.get("/api/v1/web/payments/me", async (request, reply) =>
    forwardToPaymentService(request, reply, "/api/v1/payments/me"),
  );

  server.post<{ Params: { registrationId: string } }>(
    "/api/v1/web/payments/:registrationId/confirm",
    async (request, reply) =>
      forwardToPaymentService(
        request,
        reply,
        `/api/v1/payments/${encodeURIComponent(request.params.registrationId)}/confirm`,
        "POST",
      ),
  );

  server.post<{ Params: { matchId: string } }>("/api/v1/web/sports-matches/:matchId/checkins", async (request, reply) =>
    forwardToEngagementService(
      request,
      reply,
      `/api/v1/sports-matches/${encodeURIComponent(request.params.matchId)}/checkins`,
      "POST",
    ),
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
      const query = new URL(request.url, "http://localhost").searchParams;
      if (!query.has("page")) query.set("page", "0");
      if (!query.has("size")) query.set("size", "100");
      const [registrationsResponse, ticketsResponse] = await Promise.all([
        fetchEngagementService(`${engagementServiceUrl}/api/v1/registrations/me?${query}`, {
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
      const resolveUserNames = async (ids: string[]) => {
        const uniqueIds = [...new Set(ids.filter(Boolean))];
        const names = new Map<string, string>();
        const pages = Array.from({ length: Math.ceil(uniqueIds.length / 100) }, (_, page) =>
          uniqueIds.slice(page * 100, (page + 1) * 100),
        );
        await Promise.allSettled(
          pages.map(async (page) => {
            const query = new URLSearchParams();
            page.forEach((id) => query.append("subjects[]", id));
            const directory = await fetchCampus(`${campusUrl}/users?${query}`, {
              headers: { authorization },
              signal: AbortSignal.timeout(3000),
            });
            if (!directory.ok) return;
            const { items } = (await directory.json()) as { items: { keycloakUserId: string; name: string }[] };
            items.forEach((item) => names.set(item.keycloakUserId, item.name));
          }),
        );
        return names;
      };

      if (response.ok && path.endsWith("/attendance-review")) {
        const review = (await response.json()) as {
          entries: { userId: string; checkedInAt: string }[];
          closedAt: string | null;
        };
        const names = await resolveUserNames(review.entries.map((entry) => entry.userId));
        return reply.send({
          ...review,
          entries: review.entries.map((entry) => ({
            ...entry,
            name: names.get(entry.userId) ?? null,
          })),
        });
      }
      if (response.ok && path === "/api/v1/attendance/organizer-check-ins/preview") {
        const preview = (await response.json()) as {
          eventId: string;
          eventTitle: string;
          attendanceEntryId: string;
          registrationId: string | null;
          participantUserId: string;
          status: string;
        };
        const names = await resolveUserNames([preview.participantUserId]);
        return reply.send({
          ...preview,
          participantName: names.get(preview.participantUserId) ?? null,
        });
      }
      const body = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type");
      if (contentType) reply.header("content-type", contentType);
      return reply.code(response.status).send(body);
    } catch (error) {
      request.log.error({ err: error }, "Access Service request failed");
      return reply.code(503).send({ error: "Access Service unavailable" });
    }
  }

  for (const method of ["GET", "POST"] as const) {
    server.route<{ Params: { eventId: string } }>({
      method,
      url: "/api/v1/web/attendance/events/:eventId/attendance-review",
      handler: (request, reply) =>
        forwardToAccessService(
          request,
          reply,
          `/api/v1/attendance/events/${encodeURIComponent(request.params.eventId)}/attendance-review`,
          method,
        ),
    });
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

  server.get<{ Params: { eventId: string } }>(
    "/api/v1/web/attendance/events/:eventId/organizer-action",
    async (request, reply) =>
      forwardToAccessService(
        request,
        reply,
        `/api/v1/attendance/events/${encodeURIComponent(request.params.eventId)}/organizer-action`,
        "GET",
      ),
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
