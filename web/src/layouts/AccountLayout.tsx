import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon, type IconName } from "../components/Icon";
import { BrandMark } from "../components/BrandMark";

interface AccountLayoutProps {
  keycloak: Keycloak;
}

const navigation: { to: string; label: string; icon: IconName }[] = [
  { to: "/perfil", label: "Meu perfil", icon: "profile" },
  { to: "/seguranca", label: "Segurança", icon: "shield" },
  { to: "/aparencia", label: "Aparência", icon: "palette" },
];

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/seguranca")) return "Segurança da conta";
  if (pathname.startsWith("/aparencia")) return "Aparência";
  return "Meu perfil";
}

export function AccountLayout({ keycloak }: AccountLayoutProps) {
  const location = useLocation();
  const title = pageTitle(location.pathname);
  const email = keycloak.tokenParsed?.email ?? "";
  const initial = String(email).charAt(0).toLocaleUpperCase("pt-BR") || "U";
  const returnPath = sessionStorage.getItem("unir.lastMainPath");
  const allowedReturnPaths = ["/", "/comunidades", "/entidades", "/eventos", "/esportes", "/oportunidades"];
  const isKnownDetail = returnPath ? /^\/(entidades|eventos)\/[a-z0-9-]+$/.test(returnPath) : false;
  const returnTo = returnPath && (allowedReturnPaths.includes(returnPath) || isKnownDetail) ? returnPath : "/";

  useEffect(() => {
    document.title = `UNIR — ${title}`;
  }, [title]);

  return (
    <main className="account-shell">
      <aside className="account-sidebar">
        <Link className="brand" to={returnTo} aria-label="Voltar à UNIR">
          <BrandMark />
          <span>UNIR</span>
        </Link>
        <p className="sidebar-caption">Conta UNIR</p>
        <nav className="account-nav" aria-label="Navegação da conta">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">{initial}</span>
          <div className="sidebar-account-copy">
            <strong>Conta pessoal</strong>
            <span>UNIR · sessão ativa</span>
          </div>
        </div>
      </aside>

      <section className="account-main">
        <header className="account-topbar">
          <div>
            <p className="eyebrow">Minha conta</p>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <Link className="text-button account-return-link" to={returnTo}>
              <Icon name="arrowLeft" width="16" height="16" />
              Voltar à UNIR
            </Link>
            <button
              className="text-button"
              onClick={() => void keycloak.logout({ redirectUri: `${window.location.origin}/login` })}
            >
              <Icon name="logout" width="16" height="16" />
              Sair
            </button>
          </div>
        </header>
        <div className="account-page">
          <Outlet context={{ keycloak }} />
        </div>
      </section>
    </main>
  );
}
