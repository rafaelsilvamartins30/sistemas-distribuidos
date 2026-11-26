import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { AppearanceProvider } from "./contexts/AppearanceContext";
import { ToastProvider } from "./contexts/ToastContext";
import { AccountLayout } from "./layouts/AccountLayout";
import { MainLayout } from "./layouts/MainLayout";
import { AppearancePage } from "./pages/AppearancePage";
import { CampusRequestsPage } from "./pages/CampusRequestsPage";
import { EventDetailPage, EventsPage } from "./pages/EventsPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MyEventsPage } from "./pages/MyEventsPage";
import { MyPaymentsPage } from "./pages/MyPaymentsPage";
import { MySpacePage } from "./pages/MySpacePage";
import { MySportsPage } from "./pages/MySportsPage";
import { OpportunityDetailPage, OpportunitiesPage } from "./pages/OpportunitiesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SecurityPage } from "./pages/SecurityPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SportsPage } from "./pages/SportsPage";
import { SportsDetailPage } from "./pages/SportsDetailPage";
import { CommunitySpacePage, ProfilesPage, UnifiedProfilePage } from "./pages/ProfilesPage";
import { getUniversity } from "./services/campus";
import { campusProfilePath, profileFilterPath, type CampusProfileType } from "./utils/profileRoutes";

interface AppProps {
  keycloak: Keycloak;
}

function LegacyProfileRedirect({ type, idParam }: { type: CampusProfileType; idParam?: string }) {
  const params = useParams();
  const location = useLocation();
  const id = idParam ? params[idParam] : undefined;
  const path = id ? campusProfilePath(type, id) : profileFilterPath(type);
  if (!id) return <Navigate to={path} replace />;
  return <Navigate to={`${path}${location.search}${location.hash}`} replace />;
}

function UniversityProfileRedirect({ keycloak }: { keycloak: Keycloak }) {
  const location = useLocation();
  const [universityId, setUniversityId] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getUniversity(keycloak.token ?? "")
      .then((university) => active && setUniversityId(university.id))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [keycloak.token]);

  if (failed) {
    return (
      <div className="profile-directory-empty">
        <strong>Não foi possível abrir o perfil da universidade</strong>
        <Link className="text-link" to="/perfis">
          Explorar todos os perfis
        </Link>
      </div>
    );
  }
  if (!universityId)
    return (
      <p className="notice" role="status">
        Abrindo perfil da universidade…
      </p>
    );
  const profilePath = campusProfilePath("UNIVERSITY", universityId);
  return <Navigate to={`${profilePath}${location.search}${location.hash}`} replace />;
}

export function App({ keycloak }: AppProps) {
  return (
    <AppearanceProvider>
      <ToastProvider>
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
              <Route path="/universidade" element={<UniversityProfileRedirect keycloak={keycloak} />} />
              <Route path="/notificacoes" element={<NotificationsPage />} />
              <Route path="/solicitacoes" element={<CampusRequestsPage />} />
              <Route path="/inicio" element={<Navigate to="/" replace />} />
              <Route path="/perfis" element={<ProfilesPage />} />
              <Route path="/perfis/:profileType/:profileId" element={<UnifiedProfilePage />} />
              <Route path="/comunidades/:communityId/central" element={<CommunitySpacePage />} />
              <Route path="/comunidades" element={<LegacyProfileRedirect type="COMMUNITY" />} />
              <Route
                path="/comunidades/:communityId"
                element={<LegacyProfileRedirect type="COMMUNITY" idParam="communityId" />}
              />
              <Route path="/departamentos" element={<LegacyProfileRedirect type="DEPARTMENT" />} />
              <Route
                path="/departamentos/:departmentId"
                element={<LegacyProfileRedirect type="DEPARTMENT" idParam="departmentId" />}
              />
              <Route path="/unidades" element={<LegacyProfileRedirect type="ACADEMIC_UNIT" />} />
              <Route
                path="/unidades/:unitId"
                element={<LegacyProfileRedirect type="ACADEMIC_UNIT" idParam="unitId" />}
              />
              <Route path="/espacos/:spaceId" element={<LegacyProfileRedirect type="COMMUNITY" idParam="spaceId" />} />
              <Route path="/entidades" element={<LegacyProfileRedirect type="ACADEMIC_ENTITY" />} />
              <Route
                path="/entidades/:entityId"
                element={<LegacyProfileRedirect type="ACADEMIC_ENTITY" idParam="entityId" />}
              />
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
              <Route path="/meus-eventos" element={<MyEventsPage />} />
              <Route path="/meus-esportes" element={<MySportsPage />} />
              <Route path="/pagamentos" element={<MyPaymentsPage />} />
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
      </ToastProvider>
    </AppearanceProvider>
  );
}
