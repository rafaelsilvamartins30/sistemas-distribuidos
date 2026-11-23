import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type Keycloak from "keycloak-js";
import {
  checkInSportsMatch,
  generateSportsMatchCheckInToken,
  getSportsEventOverview,
  recordSportsMatchScore,
  registerSportsFreeAgent,
  registerSportsTeam,
  SportsApiError,
  type SportsContextType,
  type SportsEventOverview,
} from "../services/sports.js";

interface SportsEventModalProps {
  keycloak: Keycloak;
  contextType: SportsContextType;
  contextId: string;
  initialTab?: "overview" | "teams" | "matches";
  onClose: () => void;
  onChanged: () => void;
}

type TabKey = "overview" | "teams" | "matches";

function currency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function roleLabel(role: string): string {
  if (role === "CAPTAIN") return "Capitão";
  if (role === "FREE_AGENT") return "Free agent";
  return "Integrante";
}

interface StandingRow {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scored: number;
  conceded: number;
  diff: number;
  points: number;
}

function computeStandings(overview: SportsEventOverview): StandingRow[] {
  const map = new Map<string, StandingRow>();
  for (const team of overview.teams) {
    map.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      scored: 0,
      conceded: 0,
      diff: 0,
      points: 0,
    });
  }
  for (const match of overview.matches) {
    if (match.status !== "COMPLETED" || match.homeScore === null || match.awayScore === null) continue;
    const home = map.get(match.homeTeamId);
    const away = map.get(match.awayTeamId);
    if (!home || !away) continue;
    home.played += 1;
    away.played += 1;
    home.scored += match.homeScore;
    home.conceded += match.awayScore;
    away.scored += match.awayScore;
    away.conceded += match.homeScore;
    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      home.points += overview.sport.winPoints;
      away.losses += 1;
      away.points += overview.sport.lossPoints;
    } else if (match.homeScore < match.awayScore) {
      away.wins += 1;
      away.points += overview.sport.winPoints;
      home.losses += 1;
      home.points += overview.sport.lossPoints;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += overview.sport.drawPoints;
      away.points += overview.sport.drawPoints;
    }
  }
  const rows = Array.from(map.values()).map((row) => ({ ...row, diff: row.scored - row.conceded }));
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.diff - a.diff ||
      b.wins - a.wins ||
      b.scored - a.scored ||
      a.teamName.localeCompare(b.teamName, "pt-BR"),
  );
  return rows;
}

function StandingsTable({ overview }: { overview: SportsEventOverview }) {
  const standings = computeStandings(overview);
  if (standings.length === 0) return null;
  return (
    <section className="sports-modal-section" aria-label="Classificação e andamento do campeonato">
      <h3>Andamento &amp; Classificação ({standings.length} equipes)</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle, #334155)" }}>
              <th style={{ padding: "0.45rem" }}>#</th>
              <th style={{ padding: "0.45rem" }}>Equipe</th>
              <th style={{ padding: "0.45rem" }}>Pts</th>
              <th style={{ padding: "0.45rem" }}>J</th>
              <th style={{ padding: "0.45rem" }}>V</th>
              <th style={{ padding: "0.45rem" }}>E</th>
              <th style={{ padding: "0.45rem" }}>D</th>
              <th style={{ padding: "0.45rem" }}>GP</th>
              <th style={{ padding: "0.45rem" }}>GC</th>
              <th style={{ padding: "0.45rem" }}>SG</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => (
              <tr
                key={row.teamId}
                style={{
                  borderBottom: "1px solid var(--border-subtle, #1e293b)",
                  fontWeight: row.teamId === overview.viewerTeamId ? 700 : 400,
                }}
              >
                <td style={{ padding: "0.45rem" }}>{index + 1}º</td>
                <td style={{ padding: "0.45rem" }}>
                  {row.teamName} {row.teamId === overview.viewerTeamId ? "(Sua equipe)" : ""}
                </td>
                <td style={{ padding: "0.45rem", fontWeight: 700 }}>{row.points}</td>
                <td style={{ padding: "0.45rem" }}>{row.played}</td>
                <td style={{ padding: "0.45rem" }}>{row.wins}</td>
                <td style={{ padding: "0.45rem" }}>{row.draws}</td>
                <td style={{ padding: "0.45rem" }}>{row.losses}</td>
                <td style={{ padding: "0.45rem" }}>{row.scored}</td>
                <td style={{ padding: "0.45rem" }}>{row.conceded}</td>
                <td style={{ padding: "0.45rem" }}>{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SportsEventModal({
  keycloak,
  contextType,
  contextId,
  initialTab = "overview",
  onClose,
  onChanged,
}: SportsEventModalProps) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [overview, setOverview] = useState<SportsEventOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Team enrollment form
  const [teamName, setTeamName] = useState("");
  const [memberNamesRaw, setMemberNamesRaw] = useState("");

  // Score inputs per match
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({});

  // Check-in token inputs per match
  const [checkinInputs, setCheckinInputs] = useState<Record<string, string>>({});

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const data = await getSportsEventOverview(keycloak.token, contextType, contextId);
      setOverview(data);
      const nextScores: Record<string, { home: string; away: string }> = {};
      for (const match of data.matches) {
        nextScores[match.id] = {
          home: match.homeScore === null ? "" : String(match.homeScore),
          away: match.awayScore === null ? "" : String(match.awayScore),
        };
      }
      setScores(nextScores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os detalhes.");
    } finally {
      setLoading(false);
    }
  }, [contextId, contextType, keycloak]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function handleRegisterTeam(event: FormEvent) {
    event.preventDefault();
    if (!teamName.trim()) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const memberNames = memberNamesRaw
        .split(/[\n,]+/)
        .map((name) => name.trim())
        .filter(Boolean);
      const created = await registerSportsTeam(keycloak.token, contextType, contextId, {
        name: teamName.trim(),
        memberNames,
      });
      setTeamName("");
      setMemberNamesRaw("");
      if (created.status === "PENDING_PAYMENT") {
        setFeedback(
          `Inscrição da equipe "${created.name}" criada! Finalize o pagamento em Meus pagamentos para confirmar sua vaga.`,
        );
      } else {
        setFeedback(`Equipe "${created.name}" inscrita com sucesso! Ela já aparece em Meus esportes.`);
      }
      await loadOverview();
      onChanged();
    } catch (err) {
      setError(
        err instanceof SportsApiError
          ? err.message
          : "Não foi possível inscrever a equipe. Verifique se você já está inscrito.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterFreeAgent() {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const result = await registerSportsFreeAgent(keycloak.token, contextType, contextId, {});
      if (result.status === "PENDING_PAYMENT") {
        setFeedback(
          "Cobrança gerada! Conclua o pagamento em Meus pagamentos para ser alocado automaticamente e liberar em Meus esportes.",
        );
      } else if (result.status === "ALLOCATED" && result.teamName) {
        setFeedback(`Você foi alocado automaticamente na equipe "${result.teamName}"!`);
      } else {
        setFeedback(
          "Você entrou na fila de Free Agents. Assim que houver vaga ou completar o elenco mínimo, o sistema formará sua equipe automaticamente.",
        );
      }
      await loadOverview();
      onChanged();
    } catch (err) {
      setError(err instanceof SportsApiError ? err.message : "Não foi possível realizar a inscrição individual.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveScore(matchId: string) {
    const entry = scores[matchId];
    if (!entry || entry.home === "" || entry.away === "") return;
    const homeScore = Number(entry.home);
    const awayScore = Number(entry.away);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore) || homeScore < 0 || awayScore < 0) return;

    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      await recordSportsMatchScore(keycloak.token, matchId, { homeScore, awayScore });
      setFeedback("Placar registrado!");
      await loadOverview();
      onChanged();
    } catch (err) {
      setError(err instanceof SportsApiError ? err.message : "Não foi possível salvar o placar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateCheckInToken(matchId: string) {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const result = await generateSportsMatchCheckInToken(keycloak.token, matchId);
      setFeedback(`Código de presença da partida gerado: ${result.checkinToken}`);
      await loadOverview();
      onChanged();
    } catch (err) {
      setError(err instanceof SportsApiError ? err.message : "Não foi possível gerar o código de presença.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePlayerCheckIn(matchId: string) {
    const tokenValue = (checkinInputs[matchId] ?? "").trim();
    if (!tokenValue) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      await checkInSportsMatch(keycloak.token, matchId, tokenValue);
      setFeedback("Presença confirmada na partida!");
      await loadOverview();
      onChanged();
    } catch (err) {
      setError(err instanceof SportsApiError ? err.message : "Código inválido ou presença já confirmada.");
    } finally {
      setBusy(false);
    }
  }

  const isEnrolled =
    Boolean(overview?.viewerTeamId) ||
    Boolean(overview?.viewerFreeAgentQueued) ||
    Boolean(overview?.viewerPendingPayment);

  return (
    <div className="sports-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sports-modal" onClick={(event) => event.stopPropagation()}>
        <header className="sports-modal-header">
          <div>
            <p className="sports-kicker">
              {contextType === "COMPETITION" ? "Campeonato" : "Temporada"} · {overview?.sport.name ?? "Esportes"}
            </p>
            <h2>{overview?.title ?? "Carregando…"}</h2>
          </div>
          <button type="button" className="sports-modal-close" aria-label="Fechar" onClick={onClose}>
            ✕
          </button>
        </header>

        <nav className="sports-modal-tabs" aria-label="Seções do campeonato">
          <button type="button" className={tab === "overview" ? "is-active" : ""} onClick={() => setTab("overview")}>
            Resumo &amp; Regras
          </button>
          <button type="button" className={tab === "teams" ? "is-active" : ""} onClick={() => setTab("teams")}>
            Equipes &amp; Inscrição ({overview?.teams.length ?? 0})
          </button>
          <button type="button" className={tab === "matches" ? "is-active" : ""} onClick={() => setTab("matches")}>
            Partidas &amp; Presença ({overview?.matches.length ?? 0})
          </button>
        </nav>

        <div className="sports-modal-body">
          {loading && (
            <p className="notice" role="status">
              Carregando informações…
            </p>
          )}
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}
          {feedback && (
            <p className="notice" role="status">
              {feedback}
            </p>
          )}

          {!loading && overview && tab === "overview" && (
            <div className="sports-modal-stack">
              <dl className="sports-detail-facts">
                <div>
                  <dt>Formato</dt>
                  <dd>
                    {overview.contextType === "COMPETITION"
                      ? `Fase de grupos e mata-mata (${overview.targetTeamCount} equipes)`
                      : `Pontos corridos · ${overview.formatOrMode === "double round-robin" ? "Turno e returno" : "Turno único"} (${overview.targetTeamCount} equipes)`}
                  </dd>
                </div>
                <div>
                  <dt>Prazo de inscrição</dt>
                  <dd>{formatDate(overview.registrationDeadline)}</dd>
                </div>
                <div>
                  <dt>Taxa por equipe</dt>
                  <dd>{currency(overview.teamEntryPrice)}</dd>
                </div>
                <div>
                  <dt>Inscrição Free Agent</dt>
                  <dd>{currency(overview.freeAgentPrice)}</dd>
                </div>
                <div>
                  <dt>Elenco permitido</dt>
                  <dd>
                    {overview.rosterMin}–{overview.rosterMax} atletas ({overview.sport.playersOnField} em quadra)
                  </dd>
                </div>
                <div>
                  <dt>Pontuação da modalidade</dt>
                  <dd>
                    Vitória {overview.sport.winPoints} · Empate{" "}
                    {overview.sport.allowsDraw ? overview.sport.drawPoints : "não"} · Derrota{" "}
                    {overview.sport.lossPoints} (W.O. {overview.sport.defaultForfeitScore})
                  </dd>
                </div>
              </dl>

              <StandingsTable overview={overview} />

              <div className="sports-rules-copy">
                <h3>Regulamento da modalidade ({overview.sport.name})</h3>
                <p>{overview.sport.rulesMarkdown}</p>
              </div>
            </div>
          )}

          {!loading && overview && tab === "teams" && (
            <div className="sports-modal-stack">
              {!isEnrolled ? (
                <div className="sports-enroll-grid">
                  <form className="sports-enroll-card" onSubmit={(e) => void handleRegisterTeam(e)}>
                    <h3>Inscrever Equipe (Capitão)</h3>
                    <p>Crie sua equipe e informe os nomes dos colegas (você será registrado como capitão).</p>
                    <label className="sports-field">
                      <span>Nome da equipe</span>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        placeholder="Ex: Atlética Computação"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                      />
                    </label>
                    <label className="sports-field">
                      <span>Integrantes adicionais (opcional, separados por vírgula)</span>
                      <input
                        type="text"
                        placeholder="Ex: João Silva, Pedro Souza"
                        value={memberNamesRaw}
                        onChange={(e) => setMemberNamesRaw(e.target.value)}
                      />
                    </label>
                    <button type="submit" className="button button-primary" disabled={busy}>
                      {busy ? "Inscrevendo…" : `Inscrever equipe (${currency(overview.teamEntryPrice)})`}
                    </button>
                  </form>

                  <div className="sports-enroll-card">
                    <h3>Inscrever como Free Agent</h3>
                    <p>
                      Não tem time fechado? O sistema te aloca automaticamente na equipe com menos jogadores ou na fila
                      para formar uma nova equipe assim que atingir {overview.rosterMin} atletas.
                    </p>
                    <button
                      type="button"
                      className="button button-secondary"
                      disabled={busy}
                      onClick={() => void handleRegisterFreeAgent()}
                    >
                      {busy ? "Processando…" : `Entrar como Free Agent (${currency(overview.freeAgentPrice)})`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sports-detail-note">
                  {overview.viewerPendingPayment ? (
                    <>
                      Sua inscrição está aguardando pagamento.{" "}
                      <Link className="text-link" to="/pagamentos" onClick={onClose}>
                        Ir para Meus pagamentos →
                      </Link>
                    </>
                  ) : overview.viewerTeamId ? (
                    <>
                      Você já está inscrito em uma equipe neste campeonato.{" "}
                      <Link className="text-link" to="/meus-esportes" onClick={onClose}>
                        Ver em Meus esportes →
                      </Link>
                    </>
                  ) : (
                    "Você está na fila de Free Agents aguardando alocação automática."
                  )}
                </div>
              )}

              <section className="sports-modal-section">
                <h3>
                  Equipes inscritas ({overview.teams.length}/{overview.targetTeamCount})
                </h3>
                {overview.teams.length ? (
                  <div className="sports-teams-list">
                    {overview.teams.map((team) => (
                      <article key={team.id} className="sports-team-card">
                        <div className="sports-team-card-head">
                          <strong>{team.name}</strong>
                          <span className="sports-catalog-type">
                            {team.members.length}/{overview.rosterMax} atletas
                          </span>
                        </div>
                        <ul className="sports-member-list">
                          {team.members.map((member) => (
                            <li key={member.id}>
                              <span>{member.displayName}</span>
                              <small>{roleLabel(member.role)}</small>
                            </li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="sports-empty">Nenhuma equipe inscrita ainda.</p>
                )}
              </section>

              {overview.freeAgents.length > 0 && (
                <section className="sports-modal-section">
                  <h3>Fila de Free Agents ({overview.freeAgents.length})</h3>
                  <ul className="sports-member-list">
                    {overview.freeAgents.map((fa) => (
                      <li key={fa.id}>
                        <span>{fa.displayName}</span>
                        <small>Na fila</small>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {!loading && overview && tab === "matches" && (
            <div className="sports-modal-stack">
              <StandingsTable overview={overview} />

              {overview.viewerTeamId && (
                <section className="sports-enroll-card" aria-label="Suas partidas no campeonato">
                  <h3>Agenda da Sua Equipe no Semestre (Jogos realizados e próximos)</h3>
                  {overview.matches.some(
                    (m) => m.homeTeamId === overview.viewerTeamId || m.awayTeamId === overview.viewerTeamId,
                  ) ? (
                    <ul className="sports-member-list">
                      {overview.matches
                        .filter((m) => m.homeTeamId === overview.viewerTeamId || m.awayTeamId === overview.viewerTeamId)
                        .map((m) => (
                          <li key={`my-${m.id}`}>
                            <span>
                              <strong>
                                [{m.status === "COMPLETED" ? "Já jogou" : "Vai jogar"} · Rodada {m.roundNumber}]
                              </strong>{" "}
                              {m.homeTeamName} {m.status === "COMPLETED" ? `${m.homeScore} × ${m.awayScore}` : "vs"}{" "}
                              {m.awayTeamName} · {formatDateTime(m.scheduledAt)} ({m.location})
                            </span>
                            <small>
                              {m.viewerCheckedIn
                                ? "Presença confirmada ✓"
                                : m.status === "COMPLETED"
                                  ? "Presença não lida"
                                  : m.hasCheckinToken
                                    ? "Código aberto — leia/cole abaixo"
                                    : "Aguardando dia do jogo"}
                            </small>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p>Sua equipe está confirmada neste campeonato!</p>
                  )}
                </section>
              )}

              {overview.viewerCanManage && (
                <div className="sports-enroll-card">
                  <h3>Gerência Oficial do Campeonato (Universidade)</h3>
                  <p>
                    O calendário semestral e as chaves já estão definidos. Conforme novas equipes confirmam inscrição,
                    elas preenchem automaticamente as vagas abertas na tabela abaixo. Quando você salva um placar, a
                    classificação e os resultados atualizam imediatamente para todos os participantes.
                  </p>
                </div>
              )}

              {overview.matches.length ? (
                <div className="sports-matches-list">
                  {overview.matches.map((match) => {
                    const isPlayerMatch =
                      overview.viewerTeamId !== null &&
                      (match.homeTeamId === overview.viewerTeamId || match.awayTeamId === overview.viewerTeamId);
                    const scoreDraft = scores[match.id] ?? { home: "", away: "" };
                    return (
                      <article key={match.id} className="sports-match-card">
                        <div className="sports-match-head">
                          <span className="sports-catalog-type">
                            Rodada {match.roundNumber} {isPlayerMatch ? "· Sua equipe" : ""}
                          </span>
                          <span className="sports-match-meta">
                            {formatDateTime(match.scheduledAt)} · {match.location}
                          </span>
                        </div>

                        <div className="sports-match-versus">
                          <strong>{match.homeTeamName}</strong>
                          <span className="sports-match-score">
                            {match.status === "COMPLETED" ? `${match.homeScore} × ${match.awayScore}` : "vs"}
                          </span>
                          <strong>{match.awayTeamName}</strong>
                        </div>

                        <div className="sports-match-footer">
                          <small>
                            {match.status === "COMPLETED" ? "Encerrada" : "Agendada"} · {match.checkinCount} presença(s)
                            confirmada(s)
                          </small>

                          {overview.viewerCanManage && (
                            <div className="sports-match-admin-controls">
                              <div className="sports-score-inputs">
                                <input
                                  type="number"
                                  min={0}
                                  aria-label={`Placar ${match.homeTeamName}`}
                                  value={scoreDraft.home}
                                  onChange={(e) =>
                                    setScores((prev) => ({
                                      ...prev,
                                      [match.id]: { ...scoreDraft, home: e.target.value },
                                    }))
                                  }
                                />
                                <span>×</span>
                                <input
                                  type="number"
                                  min={0}
                                  aria-label={`Placar ${match.awayTeamName}`}
                                  value={scoreDraft.away}
                                  onChange={(e) =>
                                    setScores((prev) => ({
                                      ...prev,
                                      [match.id]: { ...scoreDraft, away: e.target.value },
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="button button-secondary"
                                  disabled={busy}
                                  onClick={() => void handleSaveScore(match.id)}
                                >
                                  Salvar placar
                                </button>
                              </div>

                              <div className="sports-qr-admin">
                                <button
                                  type="button"
                                  className="button button-secondary"
                                  disabled={busy}
                                  onClick={() => void handleGenerateCheckInToken(match.id)}
                                >
                                  {match.checkinToken ? "Gerar novo código" : "Abrir presença (Código)"}
                                </button>
                                {match.checkinToken && (
                                  <>
                                    <span className="sports-token-badge" title="Compartilhe este código na quadra">
                                      Código: <strong>{match.checkinToken}</strong>
                                    </span>
                                    <button
                                      type="button"
                                      className="button button-secondary"
                                      onClick={() => {
                                        if (match.checkinToken) {
                                          void navigator.clipboard?.writeText(match.checkinToken);
                                          setFeedback(`Código ${match.checkinToken} copiado!`);
                                        }
                                      }}
                                    >
                                      Copiar código
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {isPlayerMatch && (
                            <div className="sports-player-checkin">
                              {match.viewerCheckedIn ? (
                                <span className="sports-checked-badge">✓ Presença confirmada</span>
                              ) : match.hasCheckinToken ? (
                                <div className="sports-checkin-form">
                                  <input
                                    type="text"
                                    placeholder="Digite ou cole o código da partida (ex: UNIR-UFLA2026)"
                                    value={checkinInputs[match.id] ?? ""}
                                    onChange={(e) =>
                                      setCheckinInputs((prev) => ({ ...prev, [match.id]: e.target.value }))
                                    }
                                  />
                                  <button
                                    type="button"
                                    className="button button-secondary"
                                    disabled={busy}
                                    onClick={async () => {
                                      try {
                                        const text = (await navigator.clipboard.readText()).trim();
                                        if (text) setCheckinInputs((prev) => ({ ...prev, [match.id]: text }));
                                      } catch {
                                        // User can still paste manually with Ctrl+V / Cmd+V.
                                      }
                                    }}
                                  >
                                    Colar código
                                  </button>
                                  <button
                                    type="button"
                                    className="button button-primary"
                                    disabled={busy}
                                    onClick={() => void handlePlayerCheckIn(match.id)}
                                  >
                                    Confirmar presença
                                  </button>
                                </div>
                              ) : (
                                <small>Aguardando organizador abrir o check-in na quadra.</small>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="sports-empty">
                  Nenhuma partida agendada ainda.{" "}
                  {overview.viewerCanManage
                    ? "Inscreva ao menos 2 equipes para gerar as partidas."
                    : "O organizador ainda não gerou a tabela de partidas."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
