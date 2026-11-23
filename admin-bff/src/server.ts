import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

interface ServerOptions {
  campusUrl?: string;
  fetch?: typeof globalThis.fetch;
}

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  return typeof authorization === "string" && /^Bearer\s+\S+$/i.test(authorization) ? authorization : null;
}

export function createServer(options: ServerOptions = {}) {
  const campusUrl = (options.campusUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  const fetchCampus = options.fetch ?? globalThis.fetch;
  const server = Fastify({ logger: true });

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

    return fetchCampus(`${campusUrl}${path}`, {
      method,
      headers,
      ...(requestBody === undefined ? {} : { body: requestBody }),
      signal: AbortSignal.timeout(5000),
    });
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

      return reply.send({
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
  server.delete<{ Params: { semesterId: string } }>("/api/v1/admin/semesters/:semesterId", async (request, reply) =>
    forwardToCampus(request, reply, `/semesters/${encodeURIComponent(request.params.semesterId)}`, "DELETE"),
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
