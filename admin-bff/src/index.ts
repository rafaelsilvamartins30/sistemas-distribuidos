import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const server = createServer({ campusUrl: process.env.CAMPUS_URL });

try {
  await server.listen({ host: "0.0.0.0", port });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}
