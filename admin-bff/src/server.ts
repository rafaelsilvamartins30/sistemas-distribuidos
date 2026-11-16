import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";

interface ServerOptions {
  campusUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createServer(options: ServerOptions = {}) {
  const campusUrl = (options.campusUrl ?? "http://localhost:3000").replace(/\/+$/, "");
  const fetchCampus = options.fetch ?? globalThis.fetch;
  const server = Fastify({ logger: true });

  server.get("/health", async () => ({ service: "admin-bff", status: "ok" }));

  async function forwardToCampus(request: FastifyRequest, reply: FastifyReply, path: string) {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) {
      return reply.code(401).send({ error: "A bearer token is required" });
    }

    let response: Response;
    let body: Buffer;
    try {
      response = await fetchCampus(`${campusUrl}${path}`, {
        method: "GET",
        headers: { authorization },
        signal: AbortSignal.timeout(5000),
      });
      body = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      request.log.error({ err: error }, "Campus request failed");
      return reply.code(503).send({ error: "User Service unavailable" });
    }

    const contentType = response.headers.get("content-type");
    if (contentType) {
      reply.header("content-type", contentType);
    }

    return reply.code(response.status).send(body);
  }

  server.get("/api/v1/admin/me", async (request, reply) => forwardToCampus(request, reply, "/users/me"));

  return server;
}
