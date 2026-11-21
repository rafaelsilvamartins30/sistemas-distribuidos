import Keycloak from "keycloak-js";

export function isStandaloneFrontendPreview(): boolean {
  return import.meta.env.DEV && window.location.port === "15174";
}

export function createPreviewKeycloak(): Keycloak {
  const keycloak = new Keycloak({ url: "http://localhost:18081", realm: "unir", clientId: "unir-web" });
  keycloak.authenticated = true;
  keycloak.token = "local-frontend-preview-token";
  keycloak.tokenParsed = {
    sub: "local-preview-user",
    name: "Rafael Silva Martins",
    email: "rafael@unir.local",
    email_verified: true,
  };
  keycloak.updateToken = async () => true;
  keycloak.login = async () => undefined;
  keycloak.logout = async () => undefined;
  return keycloak;
}
