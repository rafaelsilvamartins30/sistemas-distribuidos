FROM node:22-bookworm-slim

RUN npm install --global pnpm@11.25.0

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && CI=true pnpm prune --prod

EXPOSE 3000
CMD ["node", "dist/index.js"]
