import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

interface ServerOptions {
  userServiceUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createServer(options: ServerOptions = {}) {
  const userServiceUrl = (options.userServiceUrl ?? "http://localhost:8080").replace(/\/+$/, "");
  const fetchUserService = options.fetch ?? globalThis.fetch;
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({ service: "admin-bff", status: "ok" }));

  async function forwardToUserService(request: FastifyRequest, reply: FastifyReply, path: string) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
      return reply.code(401).send({ error: "A bearer token is required" });
    }

    let response: Response;
    let body: Buffer;
    try {
      response = await fetchUserService(`${userServiceUrl}${path}`, {
        method: "GET",
        headers: { authorization },
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

  server.get("/api/v1/admin/me", async (request, reply) => forwardToUserService(request, reply, "/users/me"));

  return server;
}
