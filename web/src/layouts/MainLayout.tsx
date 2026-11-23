import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { BrandMark } from "../components/BrandMark";
import { Icon, type IconName } from "../components/Icon";
import { RagAssistantWidget } from "../components/RagAssistantWidget";
import { getUniversity } from "../services/campus";
import { getNotifications } from "../services/campusSocial";

interface MainLayoutProps {
  keycloak: Keycloak;
}

const mainNavigation: { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Publicações", icon: "message" },
  { to: "/eventos", label: "Eventos", icon: "calendar" },
  { to: "/oportunidades", label: "Oportunidades", icon: "opportunity" },
  { to: "/esportes", label: "Esportes", icon: "calendar" },
];

function isCurrentPage(pathname: string, destination: string) {
  if (destination === "/") return pathname === "/";
  return pathname === destination || pathname.startsWith(`${destination}/`);
}

export function MainLayout({ keycloak }: MainLayoutProps) {
  const location = useLocation();
  const navigationRef = useRef<HTMLElement>(null);
  const [universityAcronym, setUniversityAcronym] = useState("UNIR");
  const [unreadCount, setUnreadCount] = useState(0);
  const email = String(keycloak.tokenParsed?.email ?? "");
  const name = String(keycloak.tokenParsed?.name ?? (email || "Minha conta"));
  const initial = (name.trim()[0] || "U").toLocaleUpperCase("pt-BR");

  useEffect(() => {
    const section = mainNavigation.find((item) => isCurrentPage(location.pathname, item.to));
    const label = location.pathname.startsWith("/perfil")
      ? "Minha conta"
      : location.pathname.startsWith("/tickets")
        ? "Meus tickets"
        : location.pathname.startsWith("/meus-esportes")
          ? "Meus esportes"
          : location.pathname.startsWith("/pagamentos")
            ? "Meus pagamentos"
            : (section?.label ?? "Campus");
    document.title = `UNIR — ${label}`;
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    if (keycloak.token) {
      void getUniversity(keycloak.token)
        .then((university) => {
          if (active) setUniversityAcronym(university.acronym);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [keycloak]);

  useEffect(() => {
    let active = true;
    if (keycloak.token) {
      void getNotifications(keycloak.token)
        .then((page) => {
          if (active) setUnreadCount(page.unreadCount ?? 0);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [keycloak, location.pathname]);

  useEffect(() => {
    const navigation = navigationRef.current;
    const current = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
    if (navigation && current && navigation.scrollWidth > navigation.clientWidth) {
      navigation.scrollLeft =
        current.offsetLeft - navigation.offsetLeft - (navigation.clientWidth - current.offsetWidth) / 2;
    }
  }, [location.pathname]);

  return (
    <div className="product-shell">
      <div className="product-main">
        <header className="product-topbar app-topbar">
          <div className="product-topbar-inner">
            <Link className="product-brand" to="/" aria-label="UNIR, início">
              <BrandMark />
              <span className="product-brand-copy">
                <strong>UNIR</strong>
                <small>{universityAcronym} · REDE UNIVERSITÁRIA</small>
              </span>
            </Link>
            <nav ref={navigationRef} className="product-nav" aria-label="Navegação principal">
              {mainNavigation.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={isCurrentPage(location.pathname, item.to) ? "is-current" : ""}
                  aria-current={isCurrentPage(location.pathname, item.to) ? "page" : undefined}
                >
                  <Icon name={item.icon} width="17" height="17" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>
            <Link
              className="notification-nav-link"
              to="/notificacoes"
              aria-label={`Notificações, ${unreadCount} não lidas`}
            >
              <Icon name="bell" width="19" height="19" />
              {unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </Link>
            <details className="account-menu">
              <summary aria-label="Abrir menu da conta">
                <span className="avatar" aria-hidden="true">
                  {initial}
                </span>
                <span className="account-menu-name">{name}</span>
                <span className="account-menu-chevron" aria-hidden="true">
                  ⌄
                </span>
              </summary>
              <div className="account-menu-panel">
                <div className="account-menu-identity">
                  <strong>{name}</strong>
                  {email && <span>{email}</span>}
                </div>
                <Link to="/perfil">
                  <Icon name="profile" width="17" height="17" /> Meu perfil
                </Link>
                <Link to="/tickets">
                  <Icon name="calendar" width="17" height="17" /> Meus tickets
                </Link>
                <Link to="/meus-esportes">
                  <Icon name="calendar" width="17" height="17" /> Meus esportes
                </Link>
                <Link to="/pagamentos">
                  <Icon name="opportunity" width="17" height="17" /> Meus pagamentos
                </Link>
                <Link to="/solicitacoes">
                  <Icon name="message" width="17" height="17" /> Solicitações
                </Link>
                <button onClick={() => void keycloak.logout({ redirectUri: `${window.location.origin}/login` })}>
                  <Icon name="logout" width="17" height="17" /> Sair
                </button>
              </div>
            </details>
          </div>
        </header>
        <main className="product-page">
          <Outlet context={{ keycloak }} />
        </main>
      </div>
      <RagAssistantWidget keycloak={keycloak} />
    </div>
  );
}
