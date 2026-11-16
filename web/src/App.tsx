import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { AppearanceProvider } from "./contexts/AppearanceContext";
import { AccountLayout } from "./layouts/AccountLayout";
import { MainLayout } from "./layouts/MainLayout";
import { AppearancePage } from "./pages/AppearancePage";
import { AdminPage } from "./pages/AdminPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { EntitiesPage, EntityDetailPage } from "./pages/EntitiesPage";
import { EventDetailPage, EventsPage } from "./pages/EventsPage";
import { DepartmentDetailPage, DepartmentsPage } from "./pages/DepartmentsPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MySpacePage } from "./pages/MySpacePage";
import { OpportunitiesPage } from "./pages/OpportunitiesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SecurityPage } from "./pages/SecurityPage";
import { SportsPage } from "./pages/SportsPage";

interface AppProps {
  keycloak: Keycloak;
}

export function App({ keycloak }: AppProps) {
  return (
    <AppearanceProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={keycloak.authenticated ? <Navigate to="/" replace /> : <LoginPage keycloak={keycloak} />}
          />
          <Route
            element={keycloak.authenticated ? <MainLayout keycloak={keycloak} /> : <Navigate to="/login" replace />}
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/inicio" element={<Navigate to="/" replace />} />
            <Route path="/comunidades" element={<CommunitiesPage />} />
            <Route path="/departamentos" element={<DepartmentsPage />} />
            <Route path="/departamentos/:departmentId" element={<DepartmentDetailPage />} />
            <Route path="/espacos/:spaceId" element={<EntityDetailPage />} />
            <Route path="/comunidades/:communityId" element={<EntityDetailPage />} />
            <Route path="/entidades" element={<EntitiesPage />} />
            <Route path="/entidades/:entityId" element={<EntityDetailPage />} />
            <Route path="/eventos" element={<EventsPage />} />
            <Route path="/eventos/:eventId" element={<EventDetailPage />} />
            <Route path="/esportes" element={<SportsPage />} />
            <Route path="/oportunidades" element={<OpportunitiesPage />} />
            <Route path="/me" element={<MySpacePage />} />
            <Route path="/my-registrations" element={<MySpacePage initialSection="Inscrições" />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route
            element={keycloak.authenticated ? <AccountLayout keycloak={keycloak} /> : <Navigate to="/login" replace />}
          >
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/seguranca" element={<SecurityPage />} />
            <Route path="/aparencia" element={<AppearancePage />} />
          </Route>
          <Route path="*" element={<Navigate to={keycloak.authenticated ? "/" : "/login"} replace />} />
        </Routes>
      </BrowserRouter>
    </AppearanceProvider>
  );
}
