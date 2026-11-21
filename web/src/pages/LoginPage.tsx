import { useEffect } from "react";
import type Keycloak from "keycloak-js";
import { BrandPanel } from "../components/BrandPanel";

interface LoginPageProps {
  keycloak: Keycloak;
}

export function LoginPage({ keycloak }: LoginPageProps) {
  const homeUrl = `${window.location.origin}/`;

  useEffect(() => {
    document.title = "UNIR — Entrar";
  }, []);

  return (
    <main className="page-shell">
      <BrandPanel />
      <section className="content-panel" aria-labelledby="login-title">
        <div className="login-card">
          <p className="eyebrow">Bem-vindo</p>
          <h2 id="login-title">Acesse a UNIR</h2>
          <p>Use suas credenciais institucionais para continuar com segurança.</p>
          <button className="button button-primary" onClick={() => void keycloak.login({ redirectUri: homeUrl })}>
            Entrar na UNIR
          </button>
          <button className="button button-secondary" onClick={() => void keycloak.register({ redirectUri: homeUrl })}>
            Criar conta
          </button>
        </div>
      </section>
    </main>
  );
}
