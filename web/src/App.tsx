import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { AppearanceProvider } from "./contexts/AppearanceContext";
import { AccountLayout } from "./layouts/AccountLayout";
import { MainLayout } from "./layouts/MainLayout";
import { AppearancePage } from "./pages/AppearancePage";
import { AcademicUnitDetailPage, AcademicUnitsPage } from "./pages/AcademicUnitsPage";
import { CampusRequestsPage } from "./pages/CampusRequestsPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { EntitiesPage, EntityDetailPage } from "./pages/EntitiesPage";
import { EventDetailPage, EventsPage } from "./pages/EventsPage";
import { DepartmentDetailPage, DepartmentsPage } from "./pages/DepartmentsPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MySpacePage } from "./pages/MySpacePage";
import { OpportunityDetailPage, OpportunitiesPage } from "./pages/OpportunitiesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SecurityPage } from "./pages/SecurityPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { UniversityPage } from "./pages/UniversityPage";
import { SportsPage } from "./pages/SportsPage";
import { SportsDetailPage } from "./pages/SportsDetailPage";

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
            <Route path="/universidade" element={<UniversityPage />} />
            <Route path="/notificacoes" element={<NotificationsPage />} />
            <Route path="/solicitacoes" element={<CampusRequestsPage />} />
            <Route path="/inicio" element={<Navigate to="/" replace />} />
            <Route path="/comunidades" element={<CommunitiesPage />} />
            <Route path="/departamentos" element={<DepartmentsPage />} />
            <Route path="/departamentos/:departmentId" element={<DepartmentDetailPage />} />
            <Route path="/unidades" element={<AcademicUnitsPage />} />
            <Route path="/unidades/:unitId" element={<AcademicUnitDetailPage />} />
            <Route path="/espacos/:spaceId" element={<EntityDetailPage />} />
            <Route path="/comunidades/:communityId" element={<EntityDetailPage />} />
            <Route path="/entidades" element={<EntitiesPage />} />
            <Route path="/entidades/:entityId" element={<EntityDetailPage />} />
            <Route path="/eventos" element={<EventsPage />} />
            <Route path="/eventos/:eventId" element={<EventDetailPage />} />
            <Route path="/esportes" element={<SportsPage />} />
            <Route path="/esportes/modalidades/:sportId" element={<SportsDetailPage kind="sport" />} />
            <Route path="/esportes/campeonatos/:competitionId" element={<SportsDetailPage kind="competition" />} />
            <Route path="/esportes/temporadas/:seasonId" element={<SportsDetailPage kind="season" />} />
            <Route path="/oportunidades" element={<OpportunitiesPage />} />
            <Route path="/oportunidades/:opportunityId" element={<OpportunityDetailPage />} />
            <Route path="/me" element={<Navigate to="/perfil" replace />} />
            <Route path="/tickets" element={<MySpacePage />} />
            <Route path="/my-registrations" element={<Navigate to="/tickets" replace />} />
            <Route path="/perfil" element={<AccountLayout keycloak={keycloak} />}>
              <Route index element={<ProfilePage />} />
              <Route path="seguranca" element={<SecurityPage />} />
              <Route path="aparencia" element={<AppearancePage />} />
            </Route>
            <Route path="/seguranca" element={<Navigate to="/perfil/seguranca" replace />} />
            <Route path="/aparencia" element={<Navigate to="/perfil/aparencia" replace />} />
            <Route path="/admin" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="*" element={<Navigate to={keycloak.authenticated ? "/" : "/login"} replace />} />
        </Routes>
      </BrowserRouter>
    </AppearanceProvider>
  );
}
