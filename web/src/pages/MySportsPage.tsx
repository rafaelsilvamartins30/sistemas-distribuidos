import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { getMySportsEnrollments, type MySportsEnrollment, type SportsContextType } from "../services/sports.js";

interface WebContext {
  keycloak: Keycloak;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

function eventDetailPath(contextType: SportsContextType, contextId: string): string {
  return contextType === "COMPETITION" ? `/esportes/campeonatos/${contextId}` : `/esportes/temporadas/${contextId}`;
}

export function MySportsPage() {
  const { keycloak } = useOutletContext<WebContext>();
  const [enrollments, setEnrollments] = useState<MySportsEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const enrollmentRes = await getMySportsEnrollments(keycloak.token);
      setEnrollments(enrollmentRes.items);
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
            <span aria-hidden="true">●</span> Minha participação esportiva
          </p>
          <h1>Meus Campeonatos</h1>
          <p>
            Selecione um dos campeonatos em que você está inscrito para abrir a tela do torneio e consultar informações,
            tabela, jogos, horários e times.
          </p>
        </div>
        <div className="sports-hero-actions">
          <div className="sports-hero-count" aria-label={`${enrollments.length} campeonatos confirmados`}>
            <strong>{enrollments.length}</strong>
            <span>Campeonatos ativos</span>
          </div>
          <Link className="button button-secondary" to="/esportes">
            ← Catálogo de Esportes
          </Link>
        </div>
      </header>

      {loading && (
        <p className="notice" role="status">
          Carregando seus campeonatos…
        </p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          Não foi possível carregar seus campeonatos.
        </p>
      )}

      {!loading && !error && (
        <section className="sports-section" aria-labelledby="my-sports-enrollments-title">
          <div className="sports-section-heading">
            <div>
              <p className="sports-kicker">Inscrições confirmadas</p>
              <h2 id="my-sports-enrollments-title">Seus Campeonatos</h2>
            </div>
            <span className="sports-count">{enrollments.length} campeonato(s)</span>
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
                        {item.contextType === "COMPETITION" ? "Campeonato · Misto" : "Pontos Corridos · Misto"}
                      </span>
                      <span className="sports-catalog-level">
                        {item.enrollmentRole === "TEAM" ? `Time: ${item.teamName}` : "Fila Free Agent"}
                      </span>
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="sports-catalog-subtitle">
                    {item.sportName} · Categoria Mista · Inscrições até {formatDate(item.registrationDeadline)}
                  </p>
                  <Link className="button button-primary" to={eventDetailPath(item.contextType, item.contextId)}>
                    Abrir campeonato →
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="sports-empty">
              Você ainda não está inscrito em nenhum campeonato. Explore o{" "}
              <Link className="text-link" to="/esportes">
                catálogo de Esportes
              </Link>{" "}
              ou finalize um pagamento pendente em{" "}
              <Link className="text-link" to="/pagamentos">
                Meus pagamentos
              </Link>
              .
            </div>
          )}
        </section>
      )}
    </div>
  );
}
