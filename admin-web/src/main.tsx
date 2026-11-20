import React from "react";
import ReactDOM from "react-dom/client";
import Keycloak from "keycloak-js";
import { App } from "./App";
import { env } from "./config/env";
import "./styles.css";

const keycloak = new Keycloak({
  url: env.keycloakUrl,
  realm: env.keycloakRealm,
  clientId: env.keycloakClientId,
});
const keycloakReady = keycloak.init({
  onLoad: "check-sso",
  pkceMethod: "S256",
  checkLoginIframe: false,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App keycloak={keycloak} keycloakReady={keycloakReady} />
  </React.StrictMode>,
);
