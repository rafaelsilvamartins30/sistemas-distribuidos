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
        <div className="content-card login-card">
          <p className="eyebrow">Bem-vindo</p>
          <h2 id="login-title">Acesse a UNIR</h2>
          <p>Entre com seu e-mail e senha ou crie sua conta para continuar.</p>
          <button className="button button-primary" onClick={() => void keycloak.login({ redirectUri: homeUrl })}>
            Entrar
          </button>
          <button className="button button-secondary" onClick={() => void keycloak.register({ redirectUri: homeUrl })}>
            Criar conta
          </button>
          <p className="login-note">Sua conta é protegida pelo Keycloak.</p>
        </div>
      </section>
    </main>
  );
}
