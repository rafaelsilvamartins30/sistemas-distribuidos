import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { SemesterSelector } from "../components/SemesterSelector";
import { useToast } from "../contexts/ToastContext";
import { isDateInSemester, useSemesterFilter } from "../hooks/useSemesterFilter";
import { getMySportsEnrollments, type MySportsEnrollment, type SportsContextType } from "../services/sports.js";
import { extractErrorMessage } from "../utils/apiError.js";

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
  const toast = useToast();
  const [enrollments, setEnrollments] = useState<MySportsEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { semesters, selectedTerm, selectedSemester, setSelectedTerm } = useSemesterFilter(keycloak.token ?? "");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const enrollmentRes = await getMySportsEnrollments(keycloak.token);
      setEnrollments(enrollmentRes.items);
    } catch (err) {
      setError(true);
      toast.error(extractErrorMessage(err, "Não foi possível carregar seus campeonatos."));
    } finally {
      setLoading(false);
    }
  }, [keycloak, toast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visibleEnrollments = enrollments.filter((item) =>
    isDateInSemester(item.firstMatchAt ?? item.registrationDeadline, selectedSemester),
  );

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
          <SemesterSelector
            id="my-sports-semester"
            value={selectedTerm}
            semesters={semesters}
            onChange={setSelectedTerm}
          />
          <div className="sports-hero-count" aria-label={`${visibleEnrollments.length} campeonatos confirmados`}>
            <strong>{visibleEnrollments.length}</strong>
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

      {!loading && !error && (
        <section className="sports-section" aria-labelledby="my-sports-enrollments-title">
          <div className="sports-section-heading">
            <div>
              <p className="sports-kicker">Inscrições confirmadas</p>
              <h2 id="my-sports-enrollments-title">Seus Campeonatos</h2>
            </div>
            <span className="sports-count">{visibleEnrollments.length} campeonato(s)</span>
          </div>

          {visibleEnrollments.length > 0 ? (
            <div className="sports-catalog-grid">
              {visibleEnrollments.map((item) => (
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
              Você ainda não está inscrito em nenhum campeonato neste semestre. Explore o{" "}
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
