import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { SportsEventModal } from "../components/SportsEventModal";
import {
  getMySportsEnrollments,
  getMySportsMatches,
  type MySportsEnrollment,
  type MySportsMatch,
  type SportsContextType,
} from "../services/sports.js";

interface WebContext {
  keycloak: Keycloak;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function MySportsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [enrollments, setEnrollments] = useState<MySportsEnrollment[]>([]);
  const [matches, setMatches] = useState<MySportsMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<{
    contextType: SportsContextType;
    contextId: string;
    initialTab?: "overview" | "teams" | "matches";
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const [enrollmentRes, matchRes] = await Promise.all([
        getMySportsEnrollments(keycloak.token),
        getMySportsMatches(keycloak.token),
      ]);
      setEnrollments(enrollmentRes.items);
      setMatches(matchRes.items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [keycloak]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="browse-page capability-page sports-page">
      <header className="sports-hero">
        <div className="sports-hero-copy">
          <p className="sports-kicker">
            <span aria-hidden="true">●</span> Minhas inscrições confirmadas
          </p>
          <h1>Meus Esportes</h1>
          <p>
            Veja os campeonatos e temporadas em que sua participação já está confirmada, acompanhe suas próximas
            partidas e confirme presença na quadra.
          </p>
        </div>
        <div className="sports-hero-actions">
          <div className="sports-hero-count" aria-label={`${enrollments.length} campeonatos confirmados`}>
            <strong>{enrollments.length}</strong>
            <span>Inscrições ativas</span>
          </div>
          <Link className="button button-secondary" to="/esportes">
            Explorar catálogo
          </Link>
        </div>
      </header>

      {loading && (
        <p className="notice" role="status">
          Carregando seus campeonatos e partidas…
        </p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          Não foi possível carregar suas inscrições esportivas.
        </p>
      )}

      {!loading && !error && (
        <>
          <section className="sports-section" aria-labelledby="my-sports-enrollments-title">
            <div className="sports-section-heading">
              <div>
                <p className="sports-kicker">Participação confirmada</p>
                <h2 id="my-sports-enrollments-title">Campeonatos &amp; Temporadas</h2>
              </div>
              <span className="sports-count">{enrollments.length} ativo(s)</span>
            </div>

            {enrollments.length > 0 ? (
              <div className="sports-catalog-grid">
                {enrollments.map((item) => (
                  <article key={`${item.contextType}-${item.contextId}`} className="sports-catalog-card">
                    <div className="sports-catalog-card-heading">
                      <span className="sports-catalog-icon" aria-hidden="true">
                        {item.contextType === "COMPETITION" ? "⚽" : "🏐"}
                      </span>
                      <span className="sports-catalog-tags">
                        <span className="sports-catalog-type">
                          {item.contextType === "COMPETITION" ? "Campeonato" : "Temporada"}
                        </span>
                        <span className="sports-catalog-level">
                          {item.enrollmentRole === "TEAM" ? `Equipe: ${item.teamName}` : "Fila Free Agent"}
                        </span>
                      </span>
                    </div>
                    <h3>{item.title}</h3>
                    <p className="sports-catalog-subtitle">
                      {item.sportName} · Inscrições até {formatDate(item.registrationDeadline)}
                    </p>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() =>
                        setSelectedEvent({
                          contextType: item.contextType,
                          contextId: item.contextId,
                          initialTab: "teams",
                        })
                      }
                    >
                      Abrir detalhes &amp; partidas
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="sports-empty">
                Você ainda não tem campeonatos confirmados. Inscreva-se no{" "}
                <Link className="text-link" to="/esportes">
                  catálogo de Esportes
                </Link>{" "}
                ou conclua um pagamento pendente em{" "}
                <Link className="text-link" to="/pagamentos">
                  Meus pagamentos
                </Link>
                .
              </div>
            )}
          </section>

          <section className="sports-section" aria-labelledby="my-sports-matches-title">
            <div className="sports-section-heading">
              <div>
                <p className="sports-kicker">Agenda em quadra</p>
                <h2 id="my-sports-matches-title">Minhas Partidas</h2>
              </div>
              <span className="sports-count">{matches.length} partida(s)</span>
            </div>

            {matches.length > 0 ? (
              <div className="sports-my-matches-grid">
                {matches.map((match) => (
                  <article key={match.matchId} className="sports-my-match-card">
                    <div className="sports-match-head">
                      <span className="sports-catalog-type">{match.sportName}</span>
                      <span className="sports-match-meta">{formatDateTime(match.scheduledAt)}</span>
                    </div>
                    <h3>{match.eventTitle}</h3>
                    <p className="sports-my-match-versus">
                      <strong>{match.teamName}</strong> vs <strong>{match.opponentName}</strong>
                    </p>
                    <p className="sports-match-meta">
                      {match.location} ·{" "}
                      {match.status === "COMPLETED"
                        ? `Placar: ${match.homeScore} × ${match.awayScore}`
                        : match.viewerCheckedIn
                          ? "Presença confirmada ✓"
                          : match.hasCheckinToken
                            ? "Check-in aberto!"
                            : "Agendada"}
                    </p>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        setSelectedEvent({
                          contextType: match.contextType,
                          contextId: match.contextId,
                          initialTab: "matches",
                        })
                      }
                    >
                      {match.hasCheckinToken && !match.viewerCheckedIn ? "Confirmar presença" : "Ver partida"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="sports-empty">Nenhuma partida agendada para suas equipes ainda.</p>
            )}
          </section>
        </>
      )}

      {selectedEvent && (
        <SportsEventModal
          keycloak={keycloak}
          contextType={selectedEvent.contextType}
          contextId={selectedEvent.contextId}
          initialTab={selectedEvent.initialTab}
          onClose={() => setSelectedEvent(null)}
          onChanged={() => void loadData()}
        />
      )}
    </div>
  );
}
