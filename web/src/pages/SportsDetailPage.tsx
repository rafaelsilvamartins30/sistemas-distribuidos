import { formatBrl } from "../utils/currency.js";
import { RegistrationRefundPolicy } from "../components/RegistrationRefundPolicy";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { UniversalAttendanceModal } from "../components/UniversalAttendanceModal";
import { PaymentCheckoutModal } from "../components/PaymentCheckoutModal";
import { RegistrationPaymentNotice } from "../components/RegistrationPaymentNotice";
import { useToast } from "../contexts/ToastContext";
import { findPendingPaymentCharge, type PaymentCharge } from "../services/payments.js";
import { extractErrorMessage } from "../utils/apiError.js";
import {
  checkInSportsMatch,
  getCompetition,
  getSeason,
  getSport,
  getSportsEventOverview,
  joinSportsTeamByCode,
  registerSportsFreeAgent,
  registerSportsTeam,
  type Competition,
  type Season,
  type Sport,
  type SportsContextType,
  type SportsEventOverview,
  type SportsMatch,
} from "../services/sports.js";

interface SportsDetailPageProps {
  kind: "sport" | "competition" | "season";
}

interface WebContext {
  keycloak: Keycloak;
}

type DetailSectionTab = "INFO" | "TABELA" | "JOGOS" | "TIMES";
type TournamentPhase = "INSCRICAO" | "ROLANDO" | "FINALIZADO" | "CANCELADO";
type TableSubView = "GRUPOS" | "MATA_MATA";

const CARDS_GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
  gap: "1rem",
};

function phaseLabel(phase: TournamentPhase): string {
  if (phase === "CANCELADO") return "Cancelado";
  if (phase === "INSCRICAO") return "Período de Inscrição";
  if (phase === "ROLANDO") return "Rolando";
  return "Finalizado";
}

function formatPriceCents(cents: number): string {
  if (!cents || cents <= 0) return "Gratuito";
  return formatBrl(cents);
}

export function SportsDetailPage({ kind }: SportsDetailPageProps) {
  const params = useParams();
  const id = params.competitionId ?? params.seasonId ?? params.sportId ?? params.id ?? "";
  const { keycloak } = useOutletContext<WebContext>();
  const toast = useToast();
  const contextType: SportsContextType = kind === "competition" ? "COMPETITION" : "SEASON";

  const [item, setItem] = useState<Competition | Season | null>(null);
  const [sport, setSport] = useState<Sport | null>(null);
  const [overview, setOverview] = useState<SportsEventOverview | null>(null);
  const [paymentPending, setPaymentPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [activeTab, setActiveTab] = useState<DetailSectionTab>("INFO");
  const [tableSubView, setTableSubView] = useState<TableSubView>("GRUPOS");
  const [selectedGroupRound, setSelectedGroupRound] = useState<number>(1);
  const [selectedRound, setSelectedRound] = useState<number>(5);

  // Registration form (only during Período de Inscrição, for students — never for Admin!)
  const [enrollMode, setEnrollMode] = useState<"TEAM" | "JOIN_CODE" | "FREE_AGENT">("TEAM");
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState("");
  const [reservedPlayerCount, setReservedPlayerCount] = useState<number>(5);
  const [acceptedFreeAgentRule, setAcceptedFreeAgentRule] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joinDisplayName, setJoinDisplayName] = useState("");
  const [freeAgentName, setFreeAgentName] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Universal Attendance Modal state
  const [attendanceModal, setAttendanceModal] = useState<{
    open: boolean;
    match: SportsMatch | null;
  }>({ open: false, match: null });
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentCharge, setPaymentCharge] = useState<PaymentCharge | null>(null);
  const [paymentChargeLoading, setPaymentChargeLoading] = useState(false);
  const [pendingPaymentRefId, setPendingPaymentRefId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");

      const record =
        kind === "competition" ? await getCompetition(keycloak.token, id) : await getSeason(keycloak.token, id);
      const [sportRecord, overviewData] = await Promise.all([
        getSport(keycloak.token, record.sportId).catch(() => null),
        getSportsEventOverview(keycloak.token, contextType, id).catch(() => null),
      ]);

      setItem(record);
      setSport(sportRecord);
      setOverview(overviewData);
      if (overviewData) setPaymentPending(overviewData.viewerPendingPayment);
    } catch (err) {
      setError(true);
      toast.error(extractErrorMessage(err, "Não foi possível carregar os dados deste campeonato."));
    } finally {
      setLoading(false);
    }
  }, [contextType, id, keycloak, kind, toast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const parsedToken = (keycloak.tokenParsed ?? {}) as {
    sub?: string;
    name?: string;
    preferred_username?: string;
  };
  const defaultDisplayName = parsedToken.name ?? parsedToken.preferred_username ?? "Estudante UFLA";

  useEffect(() => {
    if (!captainName && defaultDisplayName) setCaptainName(defaultDisplayName);
    if (!joinDisplayName && defaultDisplayName) setJoinDisplayName(defaultDisplayName);
    if (!freeAgentName && defaultDisplayName) setFreeAgentName(defaultDisplayName);
  }, [captainName, defaultDisplayName, freeAgentName, joinDisplayName]);

  const confirmedTeams = useMemo(() => (overview?.teams ?? []).filter((t) => !t.placeholder), [overview?.teams]);
  const matches = useMemo(() => overview?.matches ?? [], [overview?.matches]);
  const phase = overview?.phase ?? "INSCRICAO";

  useEffect(() => {
    if (item && reservedPlayerCount > item.rosterMax) {
      setReservedPlayerCount(item.rosterMin);
    }
  }, [item, reservedPlayerCount]);

  // Set the default participant tab based on the tournament phase.
  useEffect(() => {
    if (!item || !overview) return;
    if (phase === "ROLANDO" || phase === "FINALIZADO") {
      setActiveTab((prev) => (prev === "INFO" ? "TABELA" : prev));
    }
    if (matches.length > 0) {
      const nextScheduled = matches.find((m) => m.status === "SCHEDULED");
      const defaultRnd = nextScheduled ? nextScheduled.roundNumber : matches[0].roundNumber;
      setSelectedRound(defaultRnd);
    }
  }, [item, overview, phase, matches]);

  const myTeam = confirmedTeams.find((team) => team.id === overview?.viewerTeamId);

  // Rounds available in Jogos por Rodada / Admin
  const roundLabels = new Map(matches.map((match) => [match.roundNumber, match.roundLabel]));
  const availableRounds = [...roundLabels.keys()];
  const roundLabel = (round: number) => roundLabels.get(round) ?? `Rodada ${round}`;

  // Season standings (all 10 teams)
  const copaGroups = (overview?.standings ?? []).map((table) => ({
    ...table,
    rows: table.rows.map((row) => ({ ...row, isMyTeam: row.teamId === myTeam?.id })),
  }));
  const seasonStandings = copaGroups[0]?.rows ?? [];
  const seasonChampion = seasonStandings.find((row) => row.teamId === overview?.championTeamId);
  const groupMatches = matches.filter((match) => match.roundNumber <= 3);

  const matchesById = new Map(matches.map((match) => [match.id, match]));

  const targetPath = kind === "competition" ? `/esportes/campeonatos/${id}` : `/esportes/temporadas/${id}`;

  async function openSportsPaymentCheckout(referenceId?: string | null) {
    setPaymentModalOpen(true);
    setPaymentChargeLoading(true);
    setPaymentCharge(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const charge = await findPendingPaymentCharge(keycloak.token, {
        referenceId: referenceId ?? pendingPaymentRefId,
        targetPath,
      });
      setPaymentCharge(charge);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível carregar a cobrança Pix."));
    } finally {
      setPaymentChargeLoading(false);
    }
  }

  async function refreshAfterSportsPayment() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 300 : 500));
      try {
        await keycloak.updateToken(30);
        if (!keycloak.token) return;
        const overviewData = await getSportsEventOverview(keycloak.token, contextType, id);
        setOverview(overviewData);
        setPaymentPending(overviewData.viewerPendingPayment);
        if (!overviewData.viewerPendingPayment) return;
      } catch {
        // retry briefly while payment confirmation propagates
      }
    }
    await loadAll();
  }

  async function handleRegisterTeam(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    if (!acceptedFreeAgentRule) {
      toast.error(
        "Confirme a ciência sobre o prazo de 24 horas do código e a liberação das vagas restantes para Free Agents.",
      );
      return;
    }
    setActionBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const created = await registerSportsTeam(keycloak.token, contextType, id, {
        name: teamName.trim(),
        captainName: captainName.trim(),
        reservedPlayerCount,
      });
      const isPending = created.status === "PENDING_PAYMENT";
      setPaymentPending(isPending);
      setPendingPaymentRefId(isPending ? created.id : null);
      setTeamName("");
      setAcceptedFreeAgentRule(false);
      if (isPending) {
        toast.info("Equipe reservada! Conclua o Pix para confirmar a inscrição.");
        void openSportsPaymentCheckout(created.id);
      } else {
        toast.success(
          created.inviteCode
            ? `Time criado! Compartilhe o código ${created.inviteCode} com seus colegas (validade de 24 horas). Vagas não preenchidas viram Free Agent.`
            : "Equipe inscrita! As demais vagas do elenco foram abertas para Free Agents.",
        );
      }
      await loadAll();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível inscrever a equipe."));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleJoinByCode(event: FormEvent) {
    event.preventDefault();
    if (!item || !joinCodeInput.trim()) return;
    setActionBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const joined = await joinSportsTeamByCode(keycloak.token, contextType, id, {
        inviteCode: joinCodeInput.trim().toUpperCase(),
        displayName: joinDisplayName.trim(),
      });
      setJoinCodeInput("");
      toast.success(`Você entrou na equipe "${joined.name}" com sucesso!`);
      await loadAll();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível entrar no time com este código."));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRegisterFreeAgent(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    setActionBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const result = await registerSportsFreeAgent(keycloak.token, contextType, id, {
        displayName: freeAgentName.trim(),
      });
      const isPending = result.status === "PENDING_PAYMENT";
      setPaymentPending(isPending);
      setPendingPaymentRefId(null);
      if (isPending) {
        toast.info("Inscrição avulsa reservada! Conclua o Pix para confirmar.");
        void openSportsPaymentCheckout(null);
      } else {
        toast.success("Você foi inscrito como Atleta Avulso (Free Agent)!");
      }
      await loadAll();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível realizar a inscrição avulsa."));
    } finally {
      setActionBusy(false);
    }
  }

  function handleOpenParticipantAttendanceModal(match: SportsMatch) {
    setAttendanceModal({ open: true, match });
  }

  async function handleConfirmMatchAttendanceCode(code: string) {
    const targetMatch = attendanceModal.match;
    if (!targetMatch) return;
    setActionBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      await checkInSportsMatch(keycloak.token, targetMatch.id, code);
      setAttendanceModal((prev) => ({ ...prev, open: false }));
      toast.success(`Presença confirmada na partida ${targetMatch.homeTeamName} × ${targetMatch.awayTeamName}!`);
      await loadAll();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Não foi possível confirmar presença na partida."));
    } finally {
      setActionBusy(false);
    }
  }

  function renderMatchCard(match: SportsMatch) {
    const isMyMatch = Boolean(myTeam && (match.homeTeamId === myTeam.id || match.awayTeamId === myTeam.id));
    const canConfirmAttendance = match.viewerCanCheckIn;

    return (
      <article
        key={match.id}
        className="sports-match-card"
        style={isMyMatch ? { borderColor: "var(--accent)", borderWidth: "2px" } : undefined}
      >
        <div className="sports-match-head">
          <span className="sports-pill">
            {roundLabel(match.roundNumber)}
            {isMyMatch ? " · ★ Seu Time" : ""}
          </span>
          <span className="sports-match-meta">{new Date(match.scheduledAt).toLocaleString("pt-BR")}</span>
        </div>

        <div style={{ display: "grid", gap: "0.45rem", padding: "0.35rem 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700 }}>
            <span>{match.homeTeamName}</span>
            <span style={{ fontSize: "1.1rem" }}>{match.homeScore ?? "—"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700 }}>
            <span>{match.awayTeamName}</span>
            <span style={{ fontSize: "1.1rem" }}>{match.awayScore ?? "—"}</span>
          </div>
        </div>

        <p className="sports-match-meta" style={{ margin: 0 }}>
          {match.location || "Ginásio Poliesportivo UFLA"} ·{" "}
          {match.status === "COMPLETED"
            ? "Encerrada"
            : match.hasCheckinToken
              ? "Agendada · Check-in liberado"
              : "Agendada"}
        </p>

        {match.homePenaltyScore !== null &&
          match.homePenaltyScore !== undefined &&
          match.awayPenaltyScore !== null &&
          match.awayPenaltyScore !== undefined && (
            <p
              style={{
                margin: "0.25rem 0 0",
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "var(--accent)",
              }}
            >
              Desempate nos Pênaltis: {match.homePenaltyScore} × {match.awayPenaltyScore} (
              {match.homePenaltyScore > match.awayPenaltyScore ? match.homeTeamName : match.awayTeamName} avança)
            </p>
          )}

        {/* Presença SÓ aparece quando a partida é do seu time! */}
        {isMyMatch && (
          <div
            style={{
              marginTop: "0.25rem",
              paddingTop: "0.65rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            {match.viewerCheckedIn ? (
              <span className="sports-checked-badge">✓ Presença registrada</span>
            ) : canConfirmAttendance ? (
              <>
                <span className="sports-match-meta">Check-in aberto · confirme sua presença com o QR</span>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => handleOpenParticipantAttendanceModal(match)}
                >
                  Confirmar Presença
                </button>
              </>
            ) : !match.hasCheckinToken && match.status === "SCHEDULED" ? (
              <span className="sports-match-meta">Aguardando organizador liberar o QR Code da partida</span>
            ) : (
              <span className="sports-match-meta">Lista de presença encerrada</span>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="browse-page capability-page sports-page">
      <nav className="sports-breadcrumbs" aria-label="Navegação esportiva">
        <Link to="/esportes">← Catálogo de Esportes</Link>
        <span> · </span>
        <Link to="/meus-esportes">Meus Campeonatos</Link>
      </nav>

      {loading && (
        <p className="notice" role="status">
          Carregando informações do campeonato…
        </p>
      )}

      {!loading && !error && item && (
        <>
          <header className="sports-detail-card" style={{ marginBottom: "1.25rem" }}>
            <div className="sports-card-top" style={{ flexWrap: "wrap" }}>
              <span className="sports-pill">{sport?.name ?? "Esporte Universitário"}</span>
              <span className="sports-pill">
                {kind === "competition"
                  ? "Copa (32 times · 8 Grupos + Mata-Mata)"
                  : "Temporada (10 times · Pontos Corridos)"}
              </span>
              <span className="sports-pill">Categoria Mista</span>
              <span
                className="sports-pill"
                style={
                  phase === "CANCELADO"
                    ? { background: "rgba(220,38,38,0.14)", color: "#b91c1c" }
                    : phase === "ROLANDO"
                      ? { background: "rgba(34,197,94,0.16)", color: "#15803d" }
                      : phase === "INSCRICAO"
                        ? { background: "rgba(59,130,246,0.16)", color: "#1d4ed8" }
                        : undefined
                }
              >
                {phaseLabel(phase)}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
                flexWrap: "wrap",
                marginTop: "0.5rem",
              }}
            >
              <div style={{ flex: "1 1 420px", minWidth: 0 }}>
                <h1>{item.title}</h1>
                <p className="sports-detail-lead">
                  Organização oficial: <strong>Universidade Federal de Lavras (UFLA)</strong> · Modalidade{" "}
                  <strong>Categoria Mista</strong> ·{" "}
                  {kind === "competition"
                    ? "32 times em 8 grupos · Oitavas, quartas e semifinais em ida e volta · Final em jogo único"
                    : "10 times obrigatórios em Pontos Corridos · Rodadas 1 a 18 (Turno e Returno · Terças e Quintas)"}
                </p>
              </div>
            </div>

            {/* Navegação das informações disponíveis aos participantes. */}
            <div
              role="tablist"
              aria-label="Seções do campeonato"
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginTop: "1.25rem",
                paddingTop: "1rem",
                borderTop: "1px solid var(--border)",
              }}
            >
              <>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "INFO"}
                  className={`button ${activeTab === "INFO" ? "button-primary" : "button-secondary"}`}
                  onClick={() => setActiveTab("INFO")}
                >
                  Informações{phase === "INSCRICAO" ? " & Inscrição" : ""}
                </button>

                {(phase === "ROLANDO" || phase === "FINALIZADO") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "TABELA"}
                    className={`button ${activeTab === "TABELA" ? "button-primary" : "button-secondary"}`}
                    onClick={() => setActiveTab("TABELA")}
                  >
                    Tabela{kind === "competition" ? " & Chaveamento" : ""}
                  </button>
                )}

                {(phase === "ROLANDO" || phase === "FINALIZADO") && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "JOGOS"}
                    className={`button ${activeTab === "JOGOS" ? "button-primary" : "button-secondary"}`}
                    onClick={() => setActiveTab("JOGOS")}
                  >
                    Jogos por Rodada ({matches.length})
                  </button>
                )}

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "TIMES"}
                  className={`button ${activeTab === "TIMES" ? "button-primary" : "button-secondary"}`}
                  onClick={() => setActiveTab("TIMES")}
                >
                  Times ({confirmedTeams.length})
                </button>
              </>
            </div>
          </header>

          {paymentPending && (
            <RegistrationPaymentNotice
              origin="esportes"
              busy={paymentChargeLoading}
              onPayNow={() => void openSportsPaymentCheckout()}
            />
          )}

          {/* ABA 1: INFORMAÇÕES (& INSCRIÇÃO SE ESTIVER EM PERÍODO DE INSCRIÇÃO) */}
          {activeTab === "INFO" && (
            <div style={{ display: "grid", gap: "1.25rem" }}>
              <section className="sports-detail-card">
                <p className="sports-kicker">Resumo Oficial</p>
                <h2>Informações do Campeonato</h2>

                <dl className="sports-detail-grid" style={{ marginTop: "1rem" }}>
                  <div>
                    <dt>Situação Atual</dt>
                    <dd>{phaseLabel(phase)}</dd>
                  </div>
                  <div>
                    <dt>Categoria</dt>
                    <dd>Mista (Modelo Único)</dd>
                  </div>
                  <div>
                    <dt>Formato</dt>
                    <dd>
                      {kind === "competition"
                        ? "32 times em 8 Grupos de 4 (top 2 avançam) → Oitavas, quartas e semifinais em ida e volta · Final em jogo único"
                        : "10 times em Pontos Corridos (18 rodadas · Turno e Returno)"}
                    </dd>
                  </div>
                  <div>
                    <dt>Equipes Participantes</dt>
                    <dd>
                      {confirmedTeams.length} equipe(s) confirmada(s) · Elenco de {item.rosterMin} a {item.rosterMax}{" "}
                      atletas
                    </dd>
                  </div>
                  <div>
                    <dt>Inscrições até</dt>
                    <dd>{new Date(item.registrationDeadline).toLocaleDateString("pt-BR")}</dd>
                  </div>
                  <div>
                    <dt>Taxas de Inscrição</dt>
                    <dd>
                      Equipe: {formatPriceCents(item.teamEntryPrice)} · Avulso: {formatPriceCents(item.freeAgentPrice)}
                    </dd>
                  </div>
                </dl>

                {sport && (
                  <div className="sports-rules-box" style={{ marginTop: "1.25rem" }}>
                    <h3>Regras da Modalidade ({sport.name})</h3>
                    <p>{sport.rulesMarkdown || "Regras padrão do regulamento esportivo universitário da UFLA."}</p>
                  </div>
                )}
              </section>

              {/* Banner do Código de Convite 24h do Time (quando o aluno já está montando elenco) */}
              {myTeam && myTeam.inviteCode && (
                <section className="sports-detail-card" style={{ borderColor: "var(--accent)", borderWidth: "2px" }}>
                  <div className="sports-section-heading">
                    <div>
                      <p className="sports-kicker">Código de Convite do Seu Time · Validade 24h</p>
                      <h2>{myTeam.name}</h2>
                      <p className="sports-meta">
                        {myTeam.inviteActive
                          ? `Atletas no time: ${myTeam.members.length} / ${myTeam.reservedPlayerCount ?? item.rosterMin} vagas reservadas · Expira em ${myTeam.inviteExpiresAt ? new Date(myTeam.inviteExpiresAt).toLocaleString("pt-BR") : "24h"}. Vagas não preenchidas após 24h são liberadas para Free Agents.`
                          : "O prazo de 24 horas do código expirou. As vagas restantes do elenco estão abertas para Free Agents."}
                      </p>
                    </div>
                    {myTeam.inviteActive && (
                      <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
                        <code
                          style={{
                            padding: "0.55rem 0.9rem",
                            borderRadius: "10px",
                            background: "var(--surface-muted)",
                            fontSize: "1.1rem",
                            fontWeight: 800,
                            letterSpacing: "0.08em",
                          }}
                        >
                          {myTeam.inviteCode}
                        </code>
                        <button
                          type="button"
                          className="button button-primary"
                          onClick={() => {
                            void navigator.clipboard?.writeText(myTeam.inviteCode ?? "");
                            toast.success(
                              `Código ${myTeam.inviteCode} copiado! Envie aos seus colegas para entrarem no time em até 24 horas.`,
                            );
                          }}
                        >
                          Copiar Código
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {overview?.viewerCanEnroll && !paymentPending && (
                <section className="sports-detail-card">
                  <div className="sports-section-heading">
                    <div>
                      <p className="sports-kicker">Período de Inscrição Aberto</p>
                      <h2>Inscrever-se neste Campeonato</h2>
                      <p className="sports-meta">
                        Crie seu time e gere um <strong>código de convite válido por 24 horas</strong>, entre em um time
                        usando o código de um colega ou inscreva-se como <strong>Free Agent</strong>.
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={`button ${enrollMode === "TEAM" ? "button-primary" : "button-secondary"}`}
                        onClick={() => setEnrollMode("TEAM")}
                      >
                        Criar Time (Código 24h)
                      </button>
                      <button
                        type="button"
                        className={`button ${enrollMode === "JOIN_CODE" ? "button-primary" : "button-secondary"}`}
                        onClick={() => setEnrollMode("JOIN_CODE")}
                      >
                        Entrar com Código
                      </button>
                      <button
                        type="button"
                        className={`button ${enrollMode === "FREE_AGENT" ? "button-primary" : "button-secondary"}`}
                        onClick={() => setEnrollMode("FREE_AGENT")}
                      >
                        Entrar como Free Agent
                      </button>
                    </div>
                  </div>

                  {enrollMode === "TEAM" ? (
                    <form onSubmit={handleRegisterTeam} style={{ display: "grid", gap: "0.9rem", marginTop: "1rem" }}>
                      <label className="sports-field">
                        <span>Nome da Equipe</span>
                        <input
                          type="text"
                          required
                          placeholder="Ex.: Atlética Computação UFLA"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                        />
                      </label>
                      <label className="sports-field">
                        <span>Capitão(ã) Responsável</span>
                        <input
                          type="text"
                          required
                          value={captainName}
                          onChange={(e) => setCaptainName(e.target.value)}
                        />
                      </label>
                      <label className="sports-field">
                        <span>
                          Quantos jogadores vão entrar pelo seu código (incluindo você · de 1 a {item.rosterMax})
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={item.rosterMax}
                          required
                          value={reservedPlayerCount}
                          onChange={(e) =>
                            setReservedPlayerCount(
                              Math.max(1, Math.min(item.rosterMax, Number.parseInt(e.target.value || "1", 10) || 1)),
                            )
                          }
                        />
                      </label>
                      <div
                        style={{
                          padding: "0.85rem 1rem",
                          borderRadius: "10px",
                          background: "var(--surface-muted)",
                          fontSize: "0.88rem",
                          lineHeight: 1.5,
                        }}
                      >
                        <strong>Como funciona o Código do Time (24h):</strong>
                        <br />• Você reserva <strong>{reservedPlayerCount} vaga(s)</strong> (você +{" "}
                        <strong>{Math.max(0, reservedPlayerCount - 1)} colega(s)</strong> que entrarão usando o código
                        com a conta real deles).
                        <br />• As{" "}
                        <strong>{Math.max(0, item.rosterMin - reservedPlayerCount)} vaga(s) restante(s)</strong> até o
                        mínimo de {item.rosterMin} atletas serão completadas por <strong>Free Agents</strong>.
                        <br />• O código expira automaticamente em <strong>24 horas</strong>: se algum convidado não
                        entrar no prazo, a vaga fica livre para Free Agents.
                      </div>
                      <label className="sports-checkbox">
                        <input
                          type="checkbox"
                          checked={acceptedFreeAgentRule}
                          onChange={(e) => setAcceptedFreeAgentRule(e.target.checked)}
                        />
                        <span>
                          Estou ciente de que o código tem validade de 24 horas e as vagas restantes serão preenchidas
                          por Free Agents.
                        </span>
                      </label>
                      {item.teamEntryPrice > 0 && (
                        <>
                          <p>Após a inscrição, conclua o Pix em Meus pagamentos.</p>
                          <RegistrationRefundPolicy origin="esportes" />
                        </>
                      )}
                      <div>
                        <button type="submit" className="button button-primary" disabled={actionBusy}>
                          {actionBusy
                            ? "Inscrevendo equipe…"
                            : `Inscrever equipe (${formatPriceCents(item.teamEntryPrice)})`}
                        </button>
                      </div>
                    </form>
                  ) : enrollMode === "JOIN_CODE" ? (
                    <form onSubmit={handleJoinByCode} style={{ display: "grid", gap: "0.85rem", marginTop: "1rem" }}>
                      <label className="sports-field">
                        <span>Código de Convite do Time (validade 24h)</span>
                        <input
                          type="text"
                          required
                          placeholder="Ex.: UNIR-TVOL27"
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        />
                      </label>
                      <label className="sports-field">
                        <span>Seu Nome / Curso no Elenco</span>
                        <input
                          type="text"
                          required
                          value={joinDisplayName}
                          onChange={(e) => setJoinDisplayName(e.target.value)}
                        />
                      </label>
                      <div>
                        <button type="submit" className="button button-primary" disabled={actionBusy}>
                          {actionBusy ? "Validando código…" : "Entrar no Time com Código"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form
                      onSubmit={handleRegisterFreeAgent}
                      style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}
                    >
                      <label className="sports-field">
                        <span>Seu Nome / Curso</span>
                        <input
                          type="text"
                          required
                          value={freeAgentName}
                          onChange={(e) => setFreeAgentName(e.target.value)}
                        />
                      </label>
                      {item.freeAgentPrice > 0 && (
                        <>
                          <p>Após a inscrição, conclua o Pix em Meus pagamentos.</p>
                          <RegistrationRefundPolicy origin="esportes" />
                        </>
                      )}
                      <div>
                        <button type="submit" className="button button-primary" disabled={actionBusy}>
                          {actionBusy
                            ? "Processando…"
                            : `Entrar como Free Agent (${formatPriceCents(item.freeAgentPrice)})`}
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              )}
            </div>
          )}

          {/* ABA 2: TABELA (& CHAVEAMENTO MATA-MATA) */}
          {activeTab === "TABELA" && (
            <div style={{ display: "grid", gap: "1.25rem" }}>
              {kind === "season" ? (
                <>
                  <section className="sports-detail-card">
                    <div className="sports-section-heading">
                      <div>
                        <p className="sports-kicker">Campeonato Misto · Pontos Corridos (Turno e Returno)</p>
                        <h2>Tabela de Classificação</h2>
                      </div>
                      <span className="sports-count">
                        {seasonStandings.length} equipes · {availableRounds.length} rodadas
                      </span>
                    </div>

                    {seasonChampion && (
                      <p>
                        <strong>Equipe campeã</strong> · {seasonChampion.teamName}
                      </p>
                    )}
                    <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            <th style={{ padding: "0.6rem" }}>#</th>
                            <th style={{ padding: "0.6rem" }}>Time</th>
                            <th style={{ padding: "0.6rem", textAlign: "center" }}>PTS</th>
                            <th style={{ padding: "0.6rem", textAlign: "center" }}>J</th>
                            <th style={{ padding: "0.6rem", textAlign: "center" }}>V</th>
                            <th style={{ padding: "0.6rem", textAlign: "center" }}>E</th>
                            <th style={{ padding: "0.6rem", textAlign: "center" }}>D</th>
                            <th style={{ padding: "0.6rem", textAlign: "center" }}>GP</th>
                            <th style={{ padding: "0.6rem", textAlign: "center" }}>GC</th>
                            <th style={{ padding: "0.6rem", textAlign: "center" }}>SG</th>
                          </tr>
                        </thead>
                        <tbody>
                          {seasonStandings.map((row) => (
                            <tr
                              key={row.teamId}
                              style={{
                                borderBottom: "1px solid var(--border)",
                                background: row.isMyTeam ? "rgba(59, 130, 246, 0.1)" : undefined,
                                fontWeight: row.isMyTeam ? 700 : 400,
                              }}
                            >
                              <td style={{ padding: "0.6rem" }}>{row.rank}º</td>
                              <td style={{ padding: "0.6rem" }}>
                                {row.teamName} {row.isMyTeam ? "★ (Seu Time)" : ""}
                              </td>
                              <td style={{ padding: "0.6rem", textAlign: "center", fontWeight: 700 }}>{row.points}</td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>{row.played}</td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>{row.wins}</td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>{row.draws}</td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>{row.losses}</td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>{row.goalsFor}</td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>{row.goalsAgainst}</td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>
                                {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="sports-detail-card">
                    <div className="sports-section-heading">
                      <div>
                        <p className="sports-kicker">Confrontos por Rodada (1 a {availableRounds.length})</p>
                        <h2>Rodada {selectedRound}</h2>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.75rem 0 1.25rem" }}>
                      {availableRounds.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className={`button ${selectedRound === r ? "button-primary" : "button-secondary"}`}
                          onClick={() => setSelectedRound(r)}
                        >
                          Rodada {r}
                        </button>
                      ))}
                    </div>

                    <div style={CARDS_GRID_STYLE}>
                      {matches.filter((m) => m.roundNumber === selectedRound).map((m) => renderMatchCard(m))}
                    </div>
                  </section>
                </>
              ) : (
                /* COPA: Seletor entre Fase de Grupos e Chaveamento Mata-Mata */
                <section className="sports-detail-card">
                  <div className="sports-section-heading">
                    <div>
                      <p className="sports-kicker">
                        Campeonato Misto · 32 times em 8 Grupos → Top 2 avançam às Oitavas
                      </p>
                      <h2>Tabela &amp; Chaveamento da Copa</h2>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className={`button ${tableSubView === "GRUPOS" ? "button-primary" : "button-secondary"}`}
                        onClick={() => setTableSubView("GRUPOS")}
                      >
                        Fase de Grupos (8 Grupos)
                      </button>
                      <button
                        type="button"
                        className={`button ${tableSubView === "MATA_MATA" ? "button-primary" : "button-secondary"}`}
                        onClick={() => setTableSubView("MATA_MATA")}
                      >
                        Chaveamento Mata-Mata
                      </button>
                    </div>
                  </div>

                  {tableSubView === "GRUPOS" ? (
                    <div style={{ display: "grid", gap: "1.5rem", marginTop: "1rem" }}>
                      {/* 8 Tabelas de Grupo (Grupo A..H) — Top 2 marcados com verde (Classificados às Oitavas) */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
                          gap: "1rem",
                        }}
                      >
                        {copaGroups.map((grp) => (
                          <div
                            key={grp.groupName}
                            className="sports-match-card"
                            style={{ padding: "1rem", overflowX: "auto" }}
                          >
                            <div className="sports-match-head">
                              <h3 style={{ margin: 0 }}>{grp.groupName}</h3>
                              <span className="sports-match-meta">Os dois primeiros avançam às oitavas</span>
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                  <th style={{ padding: "0.4rem" }}>#</th>
                                  <th style={{ padding: "0.4rem" }}>Time</th>
                                  <th style={{ padding: "0.4rem", textAlign: "center" }}>PTS</th>
                                  <th style={{ padding: "0.4rem", textAlign: "center" }}>J</th>
                                  <th style={{ padding: "0.4rem", textAlign: "center" }}>V</th>
                                  <th style={{ padding: "0.4rem", textAlign: "center" }}>E</th>
                                  <th style={{ padding: "0.4rem", textAlign: "center" }}>D</th>
                                  <th style={{ padding: "0.4rem", textAlign: "center" }}>SG</th>
                                </tr>
                              </thead>
                              <tbody>
                                {grp.rows.map((row) => {
                                  const qualified = row.qualified;
                                  return (
                                    <tr
                                      key={row.teamId}
                                      style={{
                                        borderBottom: "1px solid var(--border)",
                                        borderLeft: qualified ? "3px solid #22c55e" : "3px solid transparent",
                                        background: row.isMyTeam ? "rgba(59, 130, 246, 0.1)" : undefined,
                                        fontWeight: row.isMyTeam ? 700 : 400,
                                      }}
                                    >
                                      <td style={{ padding: "0.45rem" }}>{row.rank}º</td>
                                      <td style={{ padding: "0.45rem" }}>
                                        {row.teamName} {row.isMyTeam ? "★" : ""}
                                      </td>
                                      <td style={{ padding: "0.45rem", textAlign: "center", fontWeight: 700 }}>
                                        {row.points}
                                      </td>
                                      <td style={{ padding: "0.45rem", textAlign: "center" }}>{row.played}</td>
                                      <td style={{ padding: "0.45rem", textAlign: "center" }}>{row.wins}</td>
                                      <td style={{ padding: "0.45rem", textAlign: "center" }}>{row.draws}</td>
                                      <td style={{ padding: "0.45rem", textAlign: "center" }}>{row.losses}</td>
                                      <td style={{ padding: "0.45rem", textAlign: "center" }}>
                                        {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>

                      {/* Jogos da Fase de Grupos filtrados por Rodada 1, 2 ou 3 */}
                      <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                        <div className="sports-section-heading">
                          <div>
                            <p className="sports-kicker">Partidas da Fase de Grupos</p>
                            <h3>Jogos da Rodada {selectedGroupRound}</h3>
                          </div>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            {[1, 2, 3].map((r) => (
                              <button
                                key={r}
                                type="button"
                                className={`button ${selectedGroupRound === r ? "button-primary" : "button-secondary"}`}
                                onClick={() => setSelectedGroupRound(r)}
                              >
                                Rodada {r}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div style={{ ...CARDS_GRID_STYLE, marginTop: "0.85rem" }}>
                          {groupMatches
                            .filter((m) => m.roundNumber === selectedGroupRound)
                            .map((m) => renderMatchCard(m))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* CHAVEAMENTO DE MATA-MATA VISUAL (Oitavas Ida/Volta -> Quartas A definir -> Semifinal A definir -> Final A definir) */
                    <div style={{ marginTop: "1.25rem", display: "grid", gap: "1.25rem" }}>
                      <p className="sports-match-meta" style={{ margin: 0 }}>
                        Dos 32 times nos 8 grupos, apenas os <strong>2 primeiros de cada grupo (16 equipes)</strong>{" "}
                        avançaram às <strong>Oitavas de Final (Ida e Volta)</strong>. Em caso de empate no agregado após
                        a volta, o desempate ocorre nos <strong>Pênaltis</strong>. As fases de <strong>Quartas</strong>,{" "}
                        <strong>Semifinal</strong> e <strong>Grande Final</strong> serão preenchidas conforme os
                        vencedores forem definidos em quadra.
                      </p>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                          gap: "1rem",
                          alignItems: "start",
                        }}
                      >
                        {[
                          { title: "Oitavas de final", round: 4 },
                          { title: "Quartas de final", round: 6 },
                          { title: "Semifinais", round: 8 },
                          { title: "Final · Jogo único", round: 10 },
                        ].map(({ title, round }) => {
                          const ties = (overview?.knockoutTies ?? []).filter((tie) => tie.round === round);
                          return (
                            <section key={round} className="sports-matches-list">
                              <h3>{title}</h3>
                              {!ties.length && <p className="sports-empty">Aguardando a fase anterior.</p>}
                              {ties.map((tie) => {
                                const first = matchesById.get(tie.firstMatchId);
                                if (!first) return null;
                                const second = tie.secondMatchId ? matchesById.get(tie.secondMatchId) : undefined;
                                const winner = confirmedTeams.find((team) => team.id === tie.winnerTeamId);
                                return (
                                  <div key={tie.firstMatchId} className="sports-matches-list">
                                    {round !== 10 && (
                                      <strong>
                                        Agregado · {first.homeTeamName} {tie.homeAggregate} × {tie.awayAggregate}{" "}
                                        {first.awayTeamName}
                                      </strong>
                                    )}
                                    {renderMatchCard(first)}
                                    {second && renderMatchCard(second)}
                                    {winner && (
                                      <strong>
                                        {round === 10 ? "Equipe campeã" : "Equipe classificada"} · {winner.name}
                                      </strong>
                                    )}
                                  </div>
                                );
                              })}
                            </section>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* ABA 3: JOGOS POR RODADA (SEMPRE FILTRANDO PELA RODADA / FASE) */}
          {activeTab === "JOGOS" && (
            <section className="sports-detail-card">
              <div className="sports-section-heading">
                <div>
                  <p className="sports-kicker">Calendário Oficial por Rodada</p>
                  <h2>{roundLabel(selectedRound)}</h2>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", margin: "0.75rem 0 1.25rem" }}>
                {availableRounds.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`button ${selectedRound === r ? "button-primary" : "button-secondary"}`}
                    onClick={() => setSelectedRound(r)}
                  >
                    {roundLabel(r)}
                  </button>
                ))}
              </div>

              <div style={CARDS_GRID_STYLE}>
                {matches.some((match) => match.roundNumber === selectedRound) ? (
                  matches.filter((match) => match.roundNumber === selectedRound).map(renderMatchCard)
                ) : (
                  <p className="sports-empty">Nenhum jogo definido para esta rodada.</p>
                )}
              </div>
            </section>
          )}

          {/* ABA 4: TIMES */}
          {activeTab === "TIMES" && (
            <section className="sports-detail-card">
              <div className="sports-section-heading">
                <div>
                  <p className="sports-kicker">
                    Categoria Mista · Elencos ({item.rosterMin}–{item.rosterMax} atletas)
                  </p>
                  <h2>Times do Campeonato ({confirmedTeams.length})</h2>
                </div>
              </div>
              <div className="sports-teams-list" style={{ marginTop: "0.85rem" }}>
                {confirmedTeams.map((team) => {
                  const isMine = team.id === myTeam?.id;
                  return (
                    <article
                      key={team.id}
                      className="sports-team-card"
                      style={isMine ? { borderColor: "var(--accent)", borderWidth: "2px" } : undefined}
                    >
                      <div className="sports-team-card-head">
                        <h3 style={{ margin: 0, fontSize: "1rem" }}>
                          {team.name} {isMine ? "★ (Seu Time)" : ""}
                        </h3>
                        <span className="sports-pill">{team.members.length} atletas</span>
                      </div>
                      <ul className="sports-member-list">
                        {team.members.map((member) => (
                          <li key={member.id}>
                            <span>{member.displayName}</span>
                            <small>
                              {member.role === "CAPTAIN"
                                ? "Capitão(ã)"
                                : member.role === "FREE_AGENT"
                                  ? "Free agent"
                                  : "Atleta"}
                            </small>
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {attendanceModal.open && (
            <UniversalAttendanceModal
              mode="participant"
              busy={actionBusy}
              title="Confirmar Presença na Partida"
              subtitle={
                attendanceModal.match
                  ? `${attendanceModal.match.homeTeamName} × ${attendanceModal.match.awayTeamName} (${roundLabel(attendanceModal.match.roundNumber)})`
                  : ""
              }
              token={null}
              onSubmitToken={(code) => void handleConfirmMatchAttendanceCode(code)}
              onClose={() => setAttendanceModal((prev) => ({ ...prev, open: false }))}
            />
          )}

          {paymentModalOpen && (
            <PaymentCheckoutModal
              keycloak={keycloak}
              charge={paymentCharge}
              loading={paymentChargeLoading}
              fallbackTitle={item.title}
              fallbackSubtitle={sport?.name ?? "Inscrição esportiva"}
              fallbackOrigin="esportes"
              onConfirmed={refreshAfterSportsPayment}
              onClose={() => setPaymentModalOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
