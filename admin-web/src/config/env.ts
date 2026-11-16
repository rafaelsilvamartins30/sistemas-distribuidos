export const env = {
  keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:18081",
  keycloakRealm: import.meta.env.VITE_KEYCLOAK_REALM || "unir",
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "unir-web",
  gatewayUrl: (import.meta.env.VITE_GATEWAY_URL || "http://localhost:18084").replace(/\/+$/, ""),
};
