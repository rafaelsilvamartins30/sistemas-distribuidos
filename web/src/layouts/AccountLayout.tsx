import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { Icon } from "../components/Icon";

interface WebContext {
  keycloak: Keycloak;
}

const sections = [
  { to: "/perfil", label: "Perfil acadêmico", icon: "profile", end: true },
  { to: "/perfil/seguranca", label: "Segurança", icon: "shield", end: false },
  { to: "/perfil/aparencia", label: "Aparência", icon: "palette", end: false },
] as const;

export function AccountLayout({ keycloak }: { keycloak: Keycloak }) {
  const parentContext = useOutletContext<WebContext>();

  return (
    <div className="account-settings-page">
      <header className="account-settings-heading">
        <p className="eyebrow">Conta UNIR</p>
        <h1>Perfil e configurações</h1>
        <p>Gerencie seus dados acadêmicos, o acesso e a aparência em um só lugar.</p>
      </header>

      <nav className="account-settings-tabs" aria-label="Configurações da conta">
        {sections.map((section) => (
          <NavLink key={section.to} to={section.to} end={section.end}>
            <Icon name={section.icon} width="17" height="17" />
            {section.label}
          </NavLink>
        ))}
      </nav>

      <div className="account-settings-content">
        <Outlet context={parentContext ?? { keycloak }} />
      </div>
    </div>
  );
}
