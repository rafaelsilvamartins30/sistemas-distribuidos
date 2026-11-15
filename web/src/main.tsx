import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Keycloak from "keycloak-js";
import { App } from "./App";
import { createPreviewKeycloak, isStandaloneFrontendPreview } from "./dev/frontendPreview";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
if (isStandaloneFrontendPreview()) {
  root.render(
    <StrictMode>
      <App keycloak={createPreviewKeycloak()} />
    </StrictMode>,
  );
} else {
  const keycloak = new Keycloak({
    url: import.meta.env.VITE_KEYCLOAK_URL,
    realm: import.meta.env.VITE_KEYCLOAK_REALM,
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  });
  keycloak
    .init({ onLoad: "check-sso", pkceMethod: "S256" })
    .then(() =>
      root.render(
        <StrictMode>
          <App keycloak={keycloak} />
        </StrictMode>,
      ),
    )
    .catch(() => root.render(<ConnectionError />));
}

function ConnectionError() {
  return (
    <main className="status-page">
      <section className="status-card" role="alert">
        <h1>Não foi possível conectar à UNIR.</h1>
        <p>Confira se o Keycloak está ativo e tente novamente.</p>
        <button className="button button-secondary" onClick={() => window.location.reload()}>
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
