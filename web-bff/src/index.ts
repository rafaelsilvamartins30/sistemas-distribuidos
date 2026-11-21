import { createServer } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const server = createServer({
  campusUrl: process.env.CAMPUS_URL,
  engagementServiceUrl: process.env.ENGAGEMENT_SERVICE_URL,
  accessServiceUrl: process.env.ACCESS_SERVICE_URL,
  ragServiceUrl: process.env.RAG_SERVICE_URL,
});

try {
  await server.listen({ host: "0.0.0.0", port });
} catch (error) {
  server.log.error(error);
  process.exitCode = 1;
}
