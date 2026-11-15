export const env = {
  keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL || "http://localhost:18081",
  keycloakRealm: import.meta.env.VITE_KEYCLOAK_REALM || "unir",
  keycloakClientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "unir-web",
  adminBffUrl: (import.meta.env.VITE_ADMIN_BFF_URL || "http://localhost:18088").replace(/\/+$/, ""),
};
