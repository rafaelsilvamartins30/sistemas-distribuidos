import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

interface ServerOptions {
  userServiceUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createServer(options: ServerOptions = {}) {
  const userServiceUrl = (options.userServiceUrl ?? "http://localhost:8080").replace(/\/+$/, "");
  const fetchUserService = options.fetch ?? globalThis.fetch;
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({ status: "ok" }));

  async function forwardToUserService(
    request: FastifyRequest,
    reply: FastifyReply,
    method: "GET" | "POST" | "PATCH",
    path: string,
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
      response = await fetchUserService(`${userServiceUrl}${path}`, {
        method,
        headers,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(5000),
      });
      body = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      request.log.error({ err: error }, "User Service request failed");
      return reply.code(503).send({ error: "User Service unavailable" });
    }

    const contentType = response.headers.get("content-type");
    if (contentType) {
      reply.header("content-type", contentType);
    }

    return reply.code(response.status).send(body);
  }

  server.get("/api/v1/me", async (request, reply) => forwardToUserService(request, reply, "GET", "/users/me"));

  server.post("/api/v1/users", async (request, reply) => forwardToUserService(request, reply, "POST", "/users"));

  server.patch("/api/v1/me", async (request, reply) => forwardToUserService(request, reply, "PATCH", "/users/me"));

  return server;
}
