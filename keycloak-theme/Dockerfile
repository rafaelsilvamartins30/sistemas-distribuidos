FROM node:22-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends maven default-jdk-headless \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@11.25.0
WORKDIR /theme
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build-keycloak-theme

FROM quay.io/keycloak/keycloak:26.8.0
COPY --from=build /theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar /opt/keycloak/providers/unir-theme.jar
