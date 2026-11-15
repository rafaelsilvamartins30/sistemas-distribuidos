import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { KcPage } from "./kc.gen";
import { applyKeycloakAppearance } from "./login/appearance";

applyKeycloakAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>{!window.kcContext ? <h1>No Keycloak Context</h1> : <KcPage kcContext={window.kcContext} />}</StrictMode>,
);
