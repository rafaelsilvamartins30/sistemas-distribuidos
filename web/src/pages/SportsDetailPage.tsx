import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { UniversalAttendanceModal } from "../components/UniversalAttendanceModal";
import { confirmSimulatedPayment, getMyPayments, type PaymentCharge } from "../services/payments.js";
import {
  cancelSportsEvent,
  checkInSportsMatch,
  generateSportsMatchCheckInToken,
  getCompetition,
  getSeason,
  getSport,
  getSportsEventOverview,
  joinSportsTeamByCode,
  recordSportsMatchScore,
  registerSportsFreeAgent,
  registerSportsTeam,
  updateSportsEventDeadline,
  type Competition,
  type Season,
  type Sport,
  type SportsContextType,
  type SportsEventOverview,
  type SportsMatch,
  type SportsTeam,
} from "../services/sports.js";

interface SportsDetailPageProps {
  kind: "sport" | "competition" | "season";
}

interface WebContext {
  keycloak: Keycloak;
}

type DetailSectionTab = "INFO" | "TABELA" | "JOGOS" | "TIMES" | "ADMIN";
type TournamentPhase = "INSCRICAO" | "ROLANDO" | "FINALIZADO" | "CANCELADO";
type TableSubView = "GRUPOS" | "MATA_MATA";

interface StandingsRow {
  teamId: string;
  teamName: string;
  isMyTeam: boolean;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

interface KnockoutPlaceholderMatch {
  id: string;
  phaseLabel: string;
  homeLabel: string;
  awayLabel: string;
  scheduledLabel: string;
  location: string;
}

interface KnockoutTie {
  index: number;
  label: string;
  teamAId: string;
  teamAName: string;
  teamBId: string;
  teamBName: string;
  ida: SportsMatch;
  volta?: SportsMatch;
}

const QUARTERFINAL_PLACEHOLDERS: KnockoutPlaceholderMatch[] = [
  {
    id: "placeholder-quartas-1",
    phaseLabel: "Quartas 1 (Ida e Volta)",
    homeLabel: "A definir (Vencedor Oitavas 1)",
    awayLabel: "A definir (Vencedor Oitavas 2)",
    scheduledLabel: "05/12/2026 e 06/12/2026",
    location: "Ginásio Poliesportivo UFLA — Quadra Principal",
  },
  {
    id: "placeholder-quartas-2",
    phaseLabel: "Quartas 2 (Ida e Volta)",
    homeLabel: "A definir (Vencedor Oitavas 3)",
    awayLabel: "A definir (Vencedor Oitavas 4)",
    scheduledLabel: "05/12/2026 e 06/12/2026",
    location: "Ginásio Poliesportivo UFLA — Quadra Principal",
  },
  {
    id: "placeholder-quartas-3",
    phaseLabel: "Quartas 3 (Ida e Volta)",
    homeLabel: "A definir (Vencedor Oitavas 5)",
    awayLabel: "A definir (Vencedor Oitavas 6)",
    scheduledLabel: "05/12/2026 e 06/12/2026",
    location: "Ginásio Poliesportivo UFLA — Quadra Principal",
  },
  {
    id: "placeholder-quartas-4",
    phaseLabel: "Quartas 4 (Ida e Volta)",
    homeLabel: "A definir (Vencedor Oitavas 7)",
    awayLabel: "A definir (Vencedor Oitavas 8)",
    scheduledLabel: "05/12/2026 e 06/12/2026",
    location: "Ginásio Poliesportivo UFLA — Quadra Principal",
  },
];

const SEMIFINAL_PLACEHOLDERS: KnockoutPlaceholderMatch[] = [
  {
    id: "placeholder-semi-1",
    phaseLabel: "Semifinal 1 (Ida e Volta)",
    homeLabel: "A definir (Vencedor Quartas 1)",
    awayLabel: "A definir (Vencedor Quartas 2)",
    scheduledLabel: "12/12/2026 e 13/12/2026",
    location: "Ginásio Poliesportivo UFLA — Quadra Principal",
  },
  {
    id: "placeholder-semi-2",
    phaseLabel: "Semifinal 2 (Ida e Volta)",
    homeLabel: "A definir (Vencedor Quartas 3)",
    awayLabel: "A definir (Vencedor Quartas 4)",
    scheduledLabel: "12/12/2026 e 13/12/2026",
    location: "Ginásio Poliesportivo UFLA — Quadra Principal",
  },
];

const FINAL_PLACEHOLDERS: KnockoutPlaceholderMatch[] = [
  {
    id: "placeholder-final-1",
    phaseLabel: "Grande Final",
    homeLabel: "A definir (Vencedor Semifinal 1)",
    awayLabel: "A definir (Vencedor Semifinal 2)",
    scheduledLabel: "19/12/2026, 16:00",
    location: "Ginásio Poliesportivo UFLA — Quadra Principal",
  },
];

const CARDS_GRID_STYLE = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
  gap: "1rem",
};

function computeTournamentPhase(rawStatus: string | null, matches: SportsMatch[]): TournamentPhase {
  const upper = (rawStatus ?? "").toUpperCase();
  if (upper === "CANCELLED" || upper === "CANCELADO") {
    return "CANCELADO";
  }
  if (upper === "ARCHIVED" || upper === "COMPLETED" || upper === "CLOSED" || upper === "FINALIZADO") {
    return "FINALIZADO";
  }
  const hasMatches = matches.length > 0;
  const allCompleted = hasMatches && matches.every((m) => m.status === "COMPLETED");
  if (allCompleted) {
    return "FINALIZADO";
  }
  if (upper === "ACTIVE" || upper === "IN_PROGRESS" || upper === "ROLANDO" || hasMatches) {
    return "ROLANDO";
  }
  return "INSCRICAO";
}

function phaseLabel(phase: TournamentPhase): string {
  if (phase === "CANCELADO") return "Cancelado";
  if (phase === "INSCRICAO") return "Período de Inscrição";
  if (phase === "ROLANDO") return "Rolando";
  return "Finalizado";
}

function toDatetimeLocalValue(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatPriceCents(cents: number): string {
  if (!cents || cents <= 0) return "Gratuito";
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
}

function buildStandings(teams: SportsTeam[], matches: SportsMatch[], myTeamId?: string): StandingsRow[] {
  const map = new Map<string, StandingsRow>();
  for (const team of teams) {
    map.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      isMyTeam: team.id === myTeamId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    });
  }

  for (const match of matches) {
    if (match.status !== "COMPLETED" || match.homeScore === null || match.awayScore === null) {
      continue;
    }
    const home = map.get(match.homeTeamId);
    const away = map.get(match.awayTeamId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    home.goalDiff = home.goalsFor - home.goalsAgainst;

    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;
    away.goalDiff = away.goalsFor - away.goalsAgainst;

    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (match.homeScore < match.awayScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });
}

function roundButtonLabel(contextType: SportsContextType, roundNumber: number): string {
  if (contextType === "SEASON") {
    return `Rodada ${roundNumber}`;
  }
  if (roundNumber <= 3) return `Rodada ${roundNumber} (Grupos)`;
  if (roundNumber === 4) return "Oitavas — Ida";
  if (roundNumber === 5) return "Oitavas — Volta";
  if (roundNumber === 6) return "Quartas de Final";
  if (roundNumber === 7) return "Semifinal";
  return "Grande Final";
}

function extractGroupName(location: string): string | null {
  const match = /\((Grupo\s+[A-Z])\)/i.exec(location);
  return match ? match[1] : null;
}

function findPairedIdaMatch(voltaMatch: SportsMatch, allMatches: SportsMatch[]): SportsMatch | undefined {
  return allMatches.find(
    (m) =>
      m.roundNumber === voltaMatch.roundNumber - 1 &&
      ((m.homeTeamId === voltaMatch.awayTeamId && m.awayTeamId === voltaMatch.homeTeamId) ||
        (m.homeTeamId === voltaMatch.homeTeamId && m.awayTeamId === voltaMatch.awayTeamId)),
  );
}

interface KnockoutAggregateInfo {
  idaMatch: SportsMatch;
  idaScored: boolean;
  homeIdaGoals: number | null;
  awayIdaGoals: number | null;
  aggregateHome: number | null;
  aggregateAway: number | null;
  isAggregateTied: boolean;
}

function computeKnockoutAggregate(
  voltaMatch: SportsMatch,
  allMatches: SportsMatch[],
  voltaHomeScore: number | null,
  voltaAwayScore: number | null,
): KnockoutAggregateInfo | null {
  const idaMatch = findPairedIdaMatch(voltaMatch, allMatches);
  if (!idaMatch) return null;
  const idaScored = idaMatch.homeScore !== null && idaMatch.awayScore !== null;
  if (!idaScored) {
    return {
      idaMatch,
      idaScored: false,
      homeIdaGoals: null,
      awayIdaGoals: null,
      aggregateHome: null,
      aggregateAway: null,
      isAggregateTied: false,
    };
  }
  const homeIdaGoals =
    idaMatch.homeTeamId === voltaMatch.homeTeamId ? (idaMatch.homeScore ?? 0) : (idaMatch.awayScore ?? 0);
  const awayIdaGoals =
    idaMatch.homeTeamId === voltaMatch.awayTeamId ? (idaMatch.homeScore ?? 0) : (idaMatch.awayScore ?? 0);
  if (
    voltaHomeScore === null ||
    voltaAwayScore === null ||
    Number.isNaN(voltaHomeScore) ||
    Number.isNaN(voltaAwayScore)
  ) {
    return {
      idaMatch,
      idaScored: true,
      homeIdaGoals,
      awayIdaGoals,
      aggregateHome: null,
      aggregateAway: null,
      isAggregateTied: false,
    };
  }
  const aggregateHome = homeIdaGoals + voltaHomeScore;
  const aggregateAway = awayIdaGoals + voltaAwayScore;
  return {
    idaMatch,
    idaScored: true,
    homeIdaGoals,
    awayIdaGoals,
    aggregateHome,
    aggregateAway,
    isAggregateTied: aggregateHome === aggregateAway,
  };
}

export function SportsDetailPage({ kind }: SportsDetailPageProps) {
  const params = useParams();
  const id = params.competitionId ?? params.seasonId ?? params.sportId ?? params.id ?? "";
  const { keycloak } = useOutletContext<WebContext>();
  const contextType: SportsContextType = kind === "competition" ? "COMPETITION" : "SEASON";

  const [item, setItem] = useState<Competition | Season | null>(null);
  const [sport, setSport] = useState<Sport | null>(null);
  const [overview, setOverview] = useState<SportsEventOverview | null>(null);
  const [myPayments, setMyPayments] = useState<PaymentCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [activeTab, setActiveTab] = useState<DetailSectionTab>("INFO");
  const [tableSubView, setTableSubView] = useState<TableSubView>("GRUPOS");
  const [selectedGroupRound, setSelectedGroupRound] = useState<number>(1);
  const [selectedRound, setSelectedRound] = useState<number>(5);
  const [adminRound, setAdminRound] = useState<number>(5);

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
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Admin match score + penalty shootout state
  const [scoreInputs, setScoreInputs] = useState<Record<string, { home: string; away: string }>>({});
  const [penaltyInputs, setPenaltyInputs] = useState<Record<string, { home: string; away: string }>>({});

  // Admin championship modals (Edit Registration Deadline & Cancel + Refund Saga)
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [newDeadlineLocal, setNewDeadlineLocal] = useState("");
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  // Universal Attendance Modal state
  const [attendanceModal, setAttendanceModal] = useState<{
    open: boolean;
    mode: "participant" | "organizer";
    match: SportsMatch | null;
    generatedCode: string | null;
    loadingCode: boolean;
  }>({
    open: false,
    mode: "participant",
    match: null,
    generatedCode: null,
    loadingCode: false,
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Token de acesso indisponível.");

      const record =
        kind === "competition" ? await getCompetition(keycloak.token, id) : await getSeason(keycloak.token, id);
      const [sportRecord, overviewData, paymentsPage] = await Promise.all([
        getSport(keycloak.token, record.sportId).catch(() => null),
        getSportsEventOverview(keycloak.token, contextType, id).catch(() => null),
        getMyPayments(keycloak.token).catch(() => ({ items: [] })),
      ]);

      setItem(record);
      setSport(sportRecord);
      setOverview(overviewData);
      setMyPayments(paymentsPage.items ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [contextType, id, keycloak, kind]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const parsedToken = (keycloak.tokenParsed ?? {}) as {
    sub?: string;
    name?: string;
    preferred_username?: string;
  };
  const currentUserId = parsedToken.sub ?? "";
  const defaultDisplayName = parsedToken.name ?? parsedToken.preferred_username ?? "Estudante UFLA";

  useEffect(() => {
    if (!captainName && defaultDisplayName) setCaptainName(defaultDisplayName);
    if (!joinDisplayName && defaultDisplayName) setJoinDisplayName(defaultDisplayName);
    if (!freeAgentName && defaultDisplayName) setFreeAgentName(defaultDisplayName);
  }, [captainName, defaultDisplayName, freeAgentName, joinDisplayName]);

  const isAdmin = Boolean(overview?.viewerCanManage);
  const confirmedTeams = useMemo(
    () => (overview?.teams ?? []).filter((t) => !t.name.includes("Vaga aberta")),
    [overview?.teams],
  );
  const matches = useMemo(() => overview?.matches ?? [], [overview?.matches]);
  const phase = useMemo(() => (item ? computeTournamentPhase(item.status, matches) : "INSCRICAO"), [item, matches]);

  useEffect(() => {
    if (item && reservedPlayerCount > item.rosterMax) {
      setReservedPlayerCount(item.rosterMin);
    }
  }, [item, reservedPlayerCount]);

  // Set default tab cleanly depending on Admin vs Student role and tournament phase
  useEffect(() => {
    if (!item || !overview) return;
    if (overview.viewerCanManage) {
      setActiveTab((prev) => {
        if (prev === "INFO") {
          return phase === "INSCRICAO" ? "TIMES" : "ADMIN";
        }
        return prev;
      });
    } else if (phase === "ROLANDO" || phase === "FINALIZADO") {
      setActiveTab((prev) => (prev === "INFO" ? "TABELA" : prev));
    }
    if (matches.length > 0) {
      const nextScheduled = matches.find((m) => m.status === "SCHEDULED");
      const defaultRnd = nextScheduled ? nextScheduled.roundNumber : matches[0].roundNumber;
      setSelectedRound(defaultRnd);
      setAdminRound(defaultRnd);
    }
  }, [item, overview, phase, matches.length]);

  const myTeam = useMemo(
    () =>
      isAdmin
        ? undefined
        : confirmedTeams.find(
            (t) => t.captainUserId === currentUserId || t.members.some((m) => m.userId === currentUserId),
          ),
    [confirmedTeams, currentUserId, isAdmin],
  );

  const myFreeAgent = useMemo(
    () => overview?.freeAgents.find((fa) => fa.userId === currentUserId),
    [currentUserId, overview?.freeAgents],
  );

  // Rounds available in Jogos por Rodada / Admin
  const availableRounds = useMemo(() => {
    if (contextType === "SEASON") {
      const roundsSet = new Set<number>();
      for (const m of matches) roundsSet.add(m.roundNumber);
      const list = Array.from(roundsSet).sort((a, b) => a - b);
      return list.length > 0 ? list : [1];
    }
    return [1, 2, 3, 4, 5, 6, 7, 8];
  }, [contextType, matches]);

  const adminAvailableRounds = useMemo(() => {
    const roundsSet = new Set<number>();
    for (const m of matches) roundsSet.add(m.roundNumber);
    const list = Array.from(roundsSet).sort((a, b) => a - b);
    return list.length > 0 ? list : [1];
  }, [matches]);

  // Season standings (all 10 teams)
  const seasonStandings = useMemo(
    () => buildStandings(confirmedTeams, matches, myTeam?.id),
    [confirmedTeams, matches, myTeam?.id],
  );

  // Copa 4 Groups derived directly from the actual group stage matches (never relying on arbitrary DB row order!)
  const groupMatches = useMemo(() => matches.filter((m) => m.roundNumber <= 3), [matches]);
  const copaGroups = useMemo(() => {
    if (contextType !== "COMPETITION") return [];
    const teamById = new Map(confirmedTeams.map((t) => [t.id, t]));
    const groupsByName = new Map<string, Set<string>>();

    for (const m of groupMatches) {
      const gName = extractGroupName(m.location) ?? "Fase de Grupos";
      if (!groupsByName.has(gName)) groupsByName.set(gName, new Set());
      groupsByName.get(gName)!.add(m.homeTeamId);
      groupsByName.get(gName)!.add(m.awayTeamId);
    }

    if (groupsByName.size === 0) {
      return [
        {
          groupName: "Fase de Grupos",
          rows: buildStandings(confirmedTeams, groupMatches, myTeam?.id),
        },
      ];
    }

    return Array.from(groupsByName.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupName, teamIdSet]) => {
        const groupTeams = Array.from(teamIdSet)
          .map((tid) => teamById.get(tid))
          .filter((t): t is SportsTeam => Boolean(t));
        const relevantMatches = groupMatches.filter((m) => teamIdSet.has(m.homeTeamId) && teamIdSet.has(m.awayTeamId));
        return {
          groupName,
          rows: buildStandings(groupTeams, relevantMatches, myTeam?.id),
        };
      });
  }, [confirmedTeams, contextType, groupMatches, myTeam?.id]);

  // Pair Oitavas Ida (round 4) with Oitavas Volta (round 5) for the 32-team Bracket view
  const oitavasTies = useMemo<KnockoutTie[]>(() => {
    const idaMatches = matches.filter((m) => m.roundNumber === 4);
    const voltaMatches = matches.filter((m) => m.roundNumber === 5);
    return idaMatches.map((ida, idx) => {
      const volta = voltaMatches.find(
        (v) =>
          (v.homeTeamId === ida.awayTeamId && v.awayTeamId === ida.homeTeamId) ||
          (v.homeTeamId === ida.homeTeamId && v.awayTeamId === ida.awayTeamId),
      );
      const labelMatch = /Oitavas\s+\d+\s*\([^)]+\)/.exec(ida.location);
      return {
        index: idx + 1,
        label: labelMatch ? labelMatch[0] : `Oitavas ${idx + 1}`,
        teamAId: ida.homeTeamId,
        teamAName: ida.homeTeamName,
        teamBId: ida.awayTeamId,
        teamBName: ida.awayTeamName,
        ida,
        volta,
      };
    });
  }, [matches]);

  async function handleRegisterTeam(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    if (!acceptedFreeAgentRule) {
      setFeedback({
        type: "error",
        text: "Confirme a ciência sobre o prazo de 24 horas do código e a liberação das vagas restantes para Free Agents.",
      });
      return;
    }
    setActionBusy(true);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const created = await registerSportsTeam(keycloak.token, contextType, id, {
        name: teamName.trim(),
        captainName: captainName.trim(),
        reservedPlayerCount,
      });
      setTeamName("");
      setAcceptedFreeAgentRule(false);
      setFeedback({
        type: "ok",
        text: created.inviteCode
          ? `Time criado! Compartilhe o código ${created.inviteCode} com seus colegas (validade de 24 horas). Vagas não preenchidas viram Free Agent.`
          : item.teamEntryPrice > 0
            ? "Equipe registrada! Confirme o pagamento PIX abaixo para ativar a inscrição."
            : "Equipe inscrita! As demais vagas do elenco foram abertas para Free Agents.",
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Não foi possível inscrever a equipe.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleJoinByCode(event: FormEvent) {
    event.preventDefault();
    if (!item || !joinCodeInput.trim()) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const joined = await joinSportsTeamByCode(keycloak.token, contextType, id, {
        inviteCode: joinCodeInput.trim().toUpperCase(),
        displayName: joinDisplayName.trim(),
      });
      setJoinCodeInput("");
      setFeedback({
        type: "ok",
        text: `Você entrou na equipe "${joined.name}" com sucesso!`,
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Não foi possível entrar no time com este código.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRegisterFreeAgent(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      await registerSportsFreeAgent(keycloak.token, contextType, id, {
        displayName: freeAgentName.trim(),
      });
      setFeedback({
        type: "ok",
        text:
          item.freeAgentPrice > 0
            ? "Inscrição avulsa criada! Confirme o PIX abaixo para entrar na fila."
            : "Você foi inscrito como Atleta Avulso (Free Agent)!",
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Não foi possível realizar a inscrição avulsa.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUpdateDeadline(event: FormEvent) {
    event.preventDefault();
    if (!item || !newDeadlineLocal) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const iso = new Date(newDeadlineLocal).toISOString();
      await updateSportsEventDeadline(keycloak.token, contextType, id, iso);
      setDeadlineModalOpen(false);
      setFeedback({
        type: "ok",
        text: `Data limite de inscrição atualizada para ${new Date(iso).toLocaleString("pt-BR")}.`,
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Não foi possível atualizar a data de inscrição.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCancelTournament() {
    if (!item) return;
    setActionBusy(true);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const res = await cancelSportsEvent(keycloak.token, contextType, id);
      setCancelModalOpen(false);
      setFeedback({
        type: "ok",
        text: `Campeonato cancelado! ${res.cancelledTeams} equipe(s) e ${res.cancelledFreeAgents} free agent(s) cancelados. ${res.refundsRequested} estorno(s) PIX disparado(s) automaticamente via RabbitMQ (Saga).`,
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Não foi possível cancelar o campeonato.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleConfirmPix(referenceId: string) {
    setActionBusy(true);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      await confirmSimulatedPayment(keycloak.token, referenceId);
      setFeedback({
        type: "ok",
        text: "Pagamento PIX confirmado! Sua inscrição será ativada automaticamente via RabbitMQ.",
      });
      setTimeout(() => {
        void loadAll();
      }, 900);
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Falha ao confirmar o pagamento PIX.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleOpenOrganizerAttendanceModal(match: SportsMatch) {
    setAttendanceModal({
      open: true,
      mode: "organizer",
      match,
      generatedCode: null,
      loadingCode: true,
    });
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const res = await generateSportsMatchCheckInToken(keycloak.token, match.id);
      setAttendanceModal((prev) => ({
        ...prev,
        generatedCode: res.checkinToken,
        loadingCode: false,
      }));
      await loadAll();
    } catch (err) {
      setAttendanceModal((prev) => ({ ...prev, loadingCode: false }));
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Não foi possível gerar o código de presença.",
      });
    }
  }

  function handleOpenParticipantAttendanceModal(match: SportsMatch) {
    setAttendanceModal({
      open: true,
      mode: "participant",
      match,
      generatedCode: null,
      loadingCode: false,
    });
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
      setFeedback({
        type: "ok",
        text: `Presença confirmada na partida ${targetMatch.homeTeamName} × ${targetMatch.awayTeamName}!`,
      });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Não foi possível confirmar presença na partida.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSaveScore(matchId: string) {
    const currentMatch = matches.find((m) => m.id === matchId);
    const scores = scoreInputs[matchId] ?? {
      home:
        currentMatch?.homeScore !== null && currentMatch?.homeScore !== undefined ? String(currentMatch.homeScore) : "",
      away:
        currentMatch?.awayScore !== null && currentMatch?.awayScore !== undefined ? String(currentMatch.awayScore) : "",
    };
    const homeScore = Number.parseInt(scores.home, 10);
    const awayScore = Number.parseInt(scores.away, 10);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      setFeedback({ type: "error", text: "Informe um placar válido (0 ou maior)." });
      return;
    }

    let homePenaltyScore: number | null = null;
    let awayPenaltyScore: number | null = null;
    if (contextType === "COMPETITION" && currentMatch && currentMatch.roundNumber === 5) {
      const aggInfo = computeKnockoutAggregate(currentMatch, matches, homeScore, awayScore);
      if (aggInfo && !aggInfo.idaScored) {
        setFeedback({
          type: "error",
          text: "Registre primeiro o placar do jogo de Ida antes de lançar o resultado da Volta.",
        });
        return;
      }
      if (aggInfo?.isAggregateTied) {
        const pen = penaltyInputs[matchId] ?? {
          home:
            currentMatch.homePenaltyScore !== null && currentMatch.homePenaltyScore !== undefined
              ? String(currentMatch.homePenaltyScore)
              : "",
          away:
            currentMatch.awayPenaltyScore !== null && currentMatch.awayPenaltyScore !== undefined
              ? String(currentMatch.awayPenaltyScore)
              : "",
        };
        const penH = Number.parseInt(pen.home, 10);
        const penA = Number.parseInt(pen.away, 10);
        if (Number.isNaN(penH) || Number.isNaN(penA) || penH < 0 || penA < 0 || penH === penA) {
          setFeedback({
            type: "error",
            text: `O placar agregado empatou (${aggInfo.aggregateHome} × ${aggInfo.aggregateAway}). Informe o placar dos Pênaltis sem igualdade (ex: 5 × 4).`,
          });
          return;
        }
        homePenaltyScore = penH;
        awayPenaltyScore = penA;
      }
    }

    setActionBusy(true);
    setFeedback(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      await recordSportsMatchScore(keycloak.token, matchId, {
        homeScore,
        awayScore,
        homePenaltyScore,
        awayPenaltyScore,
      });
      setFeedback({ type: "ok", text: "Resultado da partida salvo e tabela atualizada!" });
      await loadAll();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "Não foi possível salvar o resultado.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  function renderMatchCard(match: SportsMatch) {
    const isMyMatch = Boolean(myTeam && (match.homeTeamId === myTeam.id || match.awayTeamId === myTeam.id));
    const canConfirmAttendance =
      isMyMatch && match.status === "SCHEDULED" && match.hasCheckinToken && !match.viewerCheckedIn;

    return (
      <article
        key={match.id}
        className="sports-match-card"
        style={isMyMatch ? { borderColor: "var(--accent)", borderWidth: "2px" } : undefined}
      >
        <div className="sports-match-head">
          <span className="sports-pill">
            {roundButtonLabel(contextType, match.roundNumber)}
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
            ) : match.status === "COMPLETED" ? (
              <span className="sports-match-meta">Partida encerrada · Presença não registrada</span>
            ) : canConfirmAttendance ? (
              <>
                <span className="sports-match-meta">Código liberado na quadra</span>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => handleOpenParticipantAttendanceModal(match)}
                >
                  Confirmar Presença
                </button>
              </>
            ) : (
              <span className="sports-match-meta">Presença será liberada no dia do jogo</span>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <div className="browse-page capability-page sports-page">
      <nav className="sports-breadcrumbs" aria-label="Navegação esportiva">
        <Link to="/esportes">{isAdmin ? "← Gestão de Campeonatos" : "← Catálogo de Esportes"}</Link>
        {!isAdmin && (
          <>
            <span> · </span>
            <Link to="/meus-esportes">Meus Campeonatos</Link>
          </>
        )}
      </nav>

      {loading && (
        <p className="notice" role="status">
          Carregando informações do campeonato…
        </p>
      )}
      {error && (
        <p className="notice notice-error" role="alert">
          Não foi possível carregar os dados deste campeonato.
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
                    ? "32 times obrigatórios em 8 grupos (top 2 avançam para Oitavas, Quartas, Semifinal e Final em Ida e Volta com Pênaltis)"
                    : "10 times obrigatórios em Pontos Corridos · Rodadas 1 a 18 (Turno e Returno · Terças e Quintas)"}
                </p>
              </div>

              {isAdmin && phase !== "CANCELADO" && phase !== "FINALIZADO" && (
                <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      setNewDeadlineLocal(toDatetimeLocalValue(item.registrationDeadline));
                      setDeadlineModalOpen(true);
                    }}
                  >
                    Alterar data de inscrição
                  </button>
                  <button
                    type="button"
                    className="button sports-danger-button"
                    onClick={() => setCancelModalOpen(true)}
                  >
                    Cancelar campeonato
                  </button>
                </div>
              )}
            </div>

            {/* Seletor principal da tela do campeonato (visão separada para Admin vs Aluno) */}
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
              {isAdmin ? (
                <>
                  {(phase === "ROLANDO" || phase === "FINALIZADO") && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "ADMIN"}
                      className={`button ${activeTab === "ADMIN" ? "button-primary" : "button-secondary"}`}
                      onClick={() => setActiveTab("ADMIN")}
                    >
                      Gerenciar Partidas &amp; Placar
                    </button>
                  )}

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "TIMES"}
                    className={`button ${activeTab === "TIMES" ? "button-primary" : "button-secondary"}`}
                    onClick={() => setActiveTab("TIMES")}
                  >
                    Equipes &amp; Inscrições ({confirmedTeams.length})
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

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "INFO"}
                    className={`button ${activeTab === "INFO" ? "button-primary" : "button-secondary"}`}
                    onClick={() => setActiveTab("INFO")}
                  >
                    Informações
                  </button>
                </>
              ) : (
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
              )}
            </div>
          </header>

          {feedback && (
            <p
              className={`notice ${feedback.type === "error" ? "notice-error" : ""}`}
              role="status"
              style={{ marginBottom: "1rem" }}
            >
              {feedback.text}
            </p>
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
                        ? "32 times em 8 Grupos de 4 (top 2 avançam) → Oitavas, Quartas, Semifinal e Final (Ida e Volta + Pênaltis)"
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
              {!isAdmin && myTeam && myTeam.inviteCode && (
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
                            setFeedback({
                              type: "ok",
                              text: `Código ${myTeam.inviteCode} copiado! Envie aos seus colegas para entrarem no time em até 24 horas.`,
                            });
                          }}
                        >
                          Copiar Código
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {!isAdmin && phase === "INSCRICAO" && !myTeam && !myFreeAgent && (
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
                      <div>
                        <button type="submit" className="button button-primary" disabled={actionBusy}>
                          {actionBusy
                            ? "Gerando código…"
                            : `Criar Time & Gerar Código 24h (${formatPriceCents(item.teamEntryPrice)})`}
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

              {myPayments
                .filter((p) => p.status === "PENDING")
                .map((charge) => (
                  <section key={charge.chargeId} className="sports-detail-card">
                    <p className="sports-kicker">Pagamento Pendente</p>
                    <h3>Taxa de Inscrição PIX — {formatPriceCents(charge.amountMinor)}</h3>
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={actionBusy}
                      onClick={() => void handleConfirmPix(charge.referenceId)}
                    >
                      Simular Pagamento PIX Agora
                    </button>
                  </section>
                ))}
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
                          {seasonStandings.map((row, idx) => (
                            <tr
                              key={row.teamId}
                              style={{
                                borderBottom: "1px solid var(--border)",
                                background: row.isMyTeam ? "rgba(59, 130, 246, 0.1)" : undefined,
                                fontWeight: row.isMyTeam ? 700 : 400,
                              }}
                            >
                              <td style={{ padding: "0.6rem" }}>{idx + 1}º</td>
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
                              <span className="sports-match-meta">Top 2 avançam às Oitavas</span>
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
                                {grp.rows.map((row, idx) => {
                                  const qualified = idx < 2;
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
                                      <td style={{ padding: "0.45rem" }}>{idx + 1}º</td>
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
                        {/* Coluna 1: Oitavas de Final (Ida + Volta + Agregado no mesmo card!) */}
                        <div style={{ display: "grid", gap: "0.75rem" }}>
                          <div
                            className="sports-pill"
                            style={{ justifySelf: "start", background: "rgba(59,130,246,0.16)", color: "#1d4ed8" }}
                          >
                            1. Oitavas de Final (Ida e Volta)
                          </div>
                          {oitavasTies.map((tie) => {
                            const isMyTie = myTeam && (tie.teamAId === myTeam.id || tie.teamBId === myTeam.id);
                            const idaA = tie.ida.homeScore ?? 0;
                            const idaB = tie.ida.awayScore ?? 0;
                            const voltaPlayed =
                              tie.volta &&
                              tie.volta.status === "COMPLETED" &&
                              tie.volta.homeScore !== null &&
                              tie.volta.awayScore !== null;
                            const voltaA =
                              voltaPlayed && tie.volta
                                ? tie.volta.homeTeamId === tie.teamAId
                                  ? (tie.volta.homeScore ?? 0)
                                  : (tie.volta.awayScore ?? 0)
                                : 0;
                            const voltaB =
                              voltaPlayed && tie.volta
                                ? tie.volta.homeTeamId === tie.teamBId
                                  ? (tie.volta.homeScore ?? 0)
                                  : (tie.volta.awayScore ?? 0)
                                : 0;
                            const aggA = idaA + voltaA;
                            const aggB = idaB + voltaB;
                            const hasPenalties =
                              voltaPlayed &&
                              tie.volta &&
                              tie.volta.homePenaltyScore !== null &&
                              tie.volta.homePenaltyScore !== undefined &&
                              tie.volta.awayPenaltyScore !== null &&
                              tie.volta.awayPenaltyScore !== undefined;
                            const penaltyWinnerName =
                              hasPenalties && tie.volta
                                ? (tie.volta.homePenaltyScore ?? 0) > (tie.volta.awayPenaltyScore ?? 0)
                                  ? tie.volta.homeTeamName
                                  : tie.volta.awayTeamName
                                : null;
                            const tieWinnerName = voltaPlayed
                              ? aggA > aggB
                                ? tie.teamAName
                                : aggB > aggA
                                  ? tie.teamBName
                                  : penaltyWinnerName
                              : null;

                            return (
                              <div
                                key={tie.ida.id}
                                className="sports-match-card"
                                style={isMyTie ? { borderColor: "var(--accent)", borderWidth: "2px" } : undefined}
                              >
                                <div className="sports-match-head">
                                  <strong style={{ fontSize: "0.85rem" }}>
                                    {tie.label} {isMyTie ? "· ★ Seu Time" : ""}
                                  </strong>
                                  <span className="sports-match-meta">
                                    Agregado: {aggA} × {aggB}
                                  </span>
                                </div>

                                <div style={{ display: "grid", gap: "0.35rem", fontWeight: 700 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span>{tie.teamAName}</span>
                                    <span>{aggA}</span>
                                  </div>
                                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span>{tie.teamBName}</span>
                                    <span>{aggB}</span>
                                  </div>
                                </div>

                                <div
                                  style={{
                                    fontSize: "0.8rem",
                                    color: "var(--muted)",
                                    borderTop: "1px solid var(--border)",
                                    paddingTop: "0.5rem",
                                    display: "grid",
                                    gap: "0.25rem",
                                  }}
                                >
                                  <div>
                                    <strong>Ida (Encerrada):</strong> {tie.ida.homeTeamName} {tie.ida.homeScore} ×{" "}
                                    {tie.ida.awayScore} {tie.ida.awayTeamName}
                                  </div>
                                  {tie.volta && (
                                    <div>
                                      <strong>
                                        Volta ({tie.volta.status === "COMPLETED" ? "Encerrada" : "Próximo jogo"}):
                                      </strong>{" "}
                                      {tie.volta.status === "COMPLETED"
                                        ? `${tie.volta.homeTeamName} ${tie.volta.homeScore} × ${tie.volta.awayScore} ${tie.volta.awayTeamName}`
                                        : new Date(tie.volta.scheduledAt).toLocaleString("pt-BR")}
                                    </div>
                                  )}
                                  {hasPenalties && tie.volta && (
                                    <div style={{ color: "var(--accent)", fontWeight: 600 }}>
                                      <strong>Pênaltis:</strong> {tie.volta.homeTeamName} {tie.volta.homePenaltyScore} ×{" "}
                                      {tie.volta.awayPenaltyScore} {tie.volta.awayTeamName}
                                    </div>
                                  )}
                                  {tieWinnerName && (
                                    <div style={{ color: "#15803d", fontWeight: 700 }}>
                                      ✓ Classificado: {tieWinnerName}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Coluna 2: Quartas de Final (A definir!) */}
                        <div style={{ display: "grid", gap: "0.75rem" }}>
                          <div className="sports-pill" style={{ justifySelf: "start" }}>
                            2. Quartas de Final (A definir)
                          </div>
                          {QUARTERFINAL_PLACEHOLDERS.map((qf) => (
                            <div key={qf.id} className="sports-match-card" style={{ borderStyle: "dashed" }}>
                              <div className="sports-match-head">
                                <strong style={{ fontSize: "0.85rem" }}>{qf.phaseLabel}</strong>
                                <span className="sports-match-meta">{qf.scheduledLabel}</span>
                              </div>
                              <div style={{ display: "grid", gap: "0.35rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span>{qf.homeLabel}</span>
                                  <span>—</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span>{qf.awayLabel}</span>
                                  <span>—</span>
                                </div>
                              </div>
                              <p className="sports-match-meta" style={{ margin: 0 }}>
                                Aguardando vencedores das Oitavas de Final
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Coluna 3: Semifinal (A definir!) */}
                        <div style={{ display: "grid", gap: "0.75rem" }}>
                          <div className="sports-pill" style={{ justifySelf: "start" }}>
                            3. Semifinal (A definir)
                          </div>
                          {SEMIFINAL_PLACEHOLDERS.map((semi) => (
                            <div key={semi.id} className="sports-match-card" style={{ borderStyle: "dashed" }}>
                              <div className="sports-match-head">
                                <strong style={{ fontSize: "0.85rem" }}>{semi.phaseLabel}</strong>
                                <span className="sports-match-meta">{semi.scheduledLabel}</span>
                              </div>
                              <div style={{ display: "grid", gap: "0.35rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span>{semi.homeLabel}</span>
                                  <span>—</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span>{semi.awayLabel}</span>
                                  <span>—</span>
                                </div>
                              </div>
                              <p className="sports-match-meta" style={{ margin: 0 }}>
                                Aguardando vencedores das Quartas de Final
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Coluna 4: Grande Final (A definir!) */}
                        <div style={{ display: "grid", gap: "0.75rem" }}>
                          <div className="sports-pill" style={{ justifySelf: "start" }}>
                            4. Grande Final (A definir)
                          </div>
                          {FINAL_PLACEHOLDERS.map((fin) => (
                            <div key={fin.id} className="sports-match-card" style={{ borderStyle: "dashed" }}>
                              <div className="sports-match-head">
                                <strong style={{ fontSize: "0.85rem" }}>{fin.phaseLabel}</strong>
                                <span className="sports-match-meta">{fin.scheduledLabel}</span>
                              </div>
                              <div style={{ display: "grid", gap: "0.35rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span>{fin.homeLabel}</span>
                                  <span>—</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                  <span>{fin.awayLabel}</span>
                                  <span>—</span>
                                </div>
                              </div>
                              <p className="sports-match-meta" style={{ margin: 0 }}>
                                Aguardando vencedores das Semifinais
                              </p>
                            </div>
                          ))}
                        </div>
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
                  <h2>{roundButtonLabel(contextType, selectedRound)}</h2>
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
                    {roundButtonLabel(contextType, r)}
                  </button>
                ))}
              </div>

              {contextType === "COMPETITION" && selectedRound === 6 ? (
                <div style={CARDS_GRID_STYLE}>
                  {QUARTERFINAL_PLACEHOLDERS.map((qf) => (
                    <article key={qf.id} className="sports-match-card" style={{ borderStyle: "dashed" }}>
                      <div className="sports-match-head">
                        <span className="sports-pill">{qf.phaseLabel}</span>
                        <span className="sports-match-meta">{qf.scheduledLabel}</span>
                      </div>
                      <div style={{ display: "grid", gap: "0.4rem", fontWeight: 700 }}>
                        <div>{qf.homeLabel}</div>
                        <div>{qf.awayLabel}</div>
                      </div>
                      <p className="sports-match-meta" style={{ margin: 0 }}>
                        {qf.location} · Confronto aguardando vencedores das Oitavas
                      </p>
                    </article>
                  ))}
                </div>
              ) : contextType === "COMPETITION" && selectedRound === 7 ? (
                <div style={CARDS_GRID_STYLE}>
                  {SEMIFINAL_PLACEHOLDERS.map((semi) => (
                    <article key={semi.id} className="sports-match-card" style={{ borderStyle: "dashed" }}>
                      <div className="sports-match-head">
                        <span className="sports-pill">{semi.phaseLabel}</span>
                        <span className="sports-match-meta">{semi.scheduledLabel}</span>
                      </div>
                      <div style={{ display: "grid", gap: "0.4rem", fontWeight: 700 }}>
                        <div>{semi.homeLabel}</div>
                        <div>{semi.awayLabel}</div>
                      </div>
                      <p className="sports-match-meta" style={{ margin: 0 }}>
                        {semi.location} · Confronto aguardando vencedores das Quartas
                      </p>
                    </article>
                  ))}
                </div>
              ) : contextType === "COMPETITION" && selectedRound === 8 ? (
                <div style={CARDS_GRID_STYLE}>
                  {FINAL_PLACEHOLDERS.map((fin) => (
                    <article key={fin.id} className="sports-match-card" style={{ borderStyle: "dashed" }}>
                      <div className="sports-match-head">
                        <span className="sports-pill">{fin.phaseLabel}</span>
                        <span className="sports-match-meta">{fin.scheduledLabel}</span>
                      </div>
                      <div style={{ display: "grid", gap: "0.4rem", fontWeight: 700 }}>
                        <div>{fin.homeLabel}</div>
                        <div>{fin.awayLabel}</div>
                      </div>
                      <p className="sports-match-meta" style={{ margin: 0 }}>
                        {fin.location} · Confronto aguardando vencedores das Semifinais
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <div style={CARDS_GRID_STYLE}>
                  {matches.filter((m) => m.roundNumber === selectedRound).map((m) => renderMatchCard(m))}
                </div>
              )}
            </section>
          )}

          {/* ABA 4: TIMES (VISÃO DE TABELA DE GESTÃO PARA ADMIN · GRADE DE ELENCOS PARA ALUNOS) */}
          {activeTab === "TIMES" && (
            <section className="sports-detail-card">
              <div className="sports-section-heading">
                <div>
                  <p className="sports-kicker">
                    {isAdmin
                      ? `Gestão de Inscrições · ${confirmedTeams.length} de ${item.targetTeamCount} equipes`
                      : `Categoria Mista · Elencos (${item.rosterMin}–${item.rosterMax} atletas)`}
                  </p>
                  <h2>
                    {isAdmin
                      ? `Equipes & Inscrições (${confirmedTeams.length}/${item.targetTeamCount})`
                      : `Times do Campeonato (${confirmedTeams.length})`}
                  </h2>
                </div>
                {isAdmin && (overview?.freeAgents.length ?? 0) > 0 && (
                  <span className="sports-pill">{overview?.freeAgents.length} Free Agent(s) na fila</span>
                )}
              </div>

              {isAdmin ? (
                <div style={{ overflowX: "auto", marginTop: "0.85rem" }}>
                  {confirmedTeams.length === 0 ? (
                    <p className="sports-meta">Nenhuma equipe inscrita ainda neste campeonato.</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={{ padding: "0.6rem" }}>#</th>
                          <th style={{ padding: "0.6rem" }}>Equipe</th>
                          <th style={{ padding: "0.6rem" }}>Capitão(ã)</th>
                          <th style={{ padding: "0.6rem", textAlign: "center" }}>Elenco</th>
                          <th style={{ padding: "0.6rem" }}>Código 24h</th>
                          <th style={{ padding: "0.6rem" }}>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {confirmedTeams.map((team, idx) => {
                          const captain = team.members.find((m) => m.role === "CAPTAIN")?.displayName ?? "—";
                          const rosterReady = team.members.length >= item.rosterMin;
                          return (
                            <tr key={team.id} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={{ padding: "0.6rem" }}>{idx + 1}</td>
                              <td style={{ padding: "0.6rem", fontWeight: 700 }}>{team.name}</td>
                              <td style={{ padding: "0.6rem" }}>{captain}</td>
                              <td style={{ padding: "0.6rem", textAlign: "center" }}>
                                {team.members.length} / {item.rosterMin}–{item.rosterMax}
                              </td>
                              <td style={{ padding: "0.6rem" }}>
                                {team.inviteActive && team.inviteCode ? (
                                  <span>
                                    <code>{team.inviteCode}</code> (até{" "}
                                    {team.inviteExpiresAt
                                      ? new Date(team.inviteExpiresAt).toLocaleString("pt-BR")
                                      : "24h"}
                                    )
                                  </span>
                                ) : team.inviteCode ? (
                                  <span className="sports-meta">Expirado (vagas p/ Free Agents)</span>
                                ) : (
                                  <span className="sports-meta">—</span>
                                )}
                              </td>
                              <td style={{ padding: "0.6rem" }}>
                                <span
                                  className="sports-pill"
                                  style={
                                    rosterReady
                                      ? { background: "rgba(34,197,94,0.16)", color: "#15803d" }
                                      : { background: "rgba(234,179,8,0.16)", color: "#a16207" }
                                  }
                                >
                                  {rosterReady ? "Elenco Completo" : "Montando elenco"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
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
              )}
            </section>
          )}

          {/* ABA 5: GERENCIAR PARTIDAS & PLACAR (EXCLUSIVA DO ADMIN — SEM PAREDE DE PILLS DUPLICADA) */}
          {activeTab === "ADMIN" && isAdmin && (
            <section className="sports-detail-card">
              <div className="sports-section-heading">
                <div>
                  <p className="sports-kicker">Gestão da Universidade · Resultados &amp; Presença por Rodada</p>
                  <h2>Gerenciar Partidas — {roundButtonLabel(contextType, adminRound)}</h2>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.75rem 0 1.25rem" }}>
                {adminAvailableRounds.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`button ${adminRound === r ? "button-primary" : "button-secondary"}`}
                    onClick={() => setAdminRound(r)}
                  >
                    {roundButtonLabel(contextType, r)}
                  </button>
                ))}
              </div>

              <div className="sports-matches-list">
                {matches
                  .filter((m) => m.roundNumber === adminRound)
                  .map((match) => {
                    const currentScore = scoreInputs[match.id] ?? {
                      home: match.homeScore !== null ? String(match.homeScore) : "",
                      away: match.awayScore !== null ? String(match.awayScore) : "",
                    };
                    const isKnockoutReturn = contextType === "COMPETITION" && match.roundNumber === 5;
                    const parsedVoltaHome =
                      currentScore.home.trim() !== "" ? Number.parseInt(currentScore.home, 10) : null;
                    const parsedVoltaAway =
                      currentScore.away.trim() !== "" ? Number.parseInt(currentScore.away, 10) : null;
                    const aggInfo = isKnockoutReturn
                      ? computeKnockoutAggregate(match, matches, parsedVoltaHome, parsedVoltaAway)
                      : null;
                    const needsPenalties = Boolean(aggInfo?.isAggregateTied);
                    const currentPen = penaltyInputs[match.id] ?? {
                      home:
                        match.homePenaltyScore !== null && match.homePenaltyScore !== undefined
                          ? String(match.homePenaltyScore)
                          : "",
                      away:
                        match.awayPenaltyScore !== null && match.awayPenaltyScore !== undefined
                          ? String(match.awayPenaltyScore)
                          : "",
                    };

                    return (
                      <article key={match.id} className="sports-match-card">
                        <div className="sports-match-head">
                          <div>
                            <span className="sports-pill">{roundButtonLabel(contextType, match.roundNumber)}</span>
                            <span className="sports-match-meta" style={{ marginLeft: "0.65rem" }}>
                              {new Date(match.scheduledAt).toLocaleString("pt-BR")} · {match.location}
                            </span>
                          </div>
                          <span className="sports-match-meta">{match.checkinCount} presença(s) confirmada(s)</span>
                        </div>

                        {aggInfo && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.65rem",
                              flexWrap: "wrap",
                              fontSize: "0.84rem",
                              padding: "0.55rem 0.75rem",
                              borderRadius: "10px",
                              background: needsPenalties ? "rgba(234, 179, 8, 0.14)" : "var(--surface-muted, #f8fafc)",
                              border: needsPenalties ? "1px solid rgba(202, 138, 4, 0.35)" : "1px solid var(--border)",
                            }}
                          >
                            {aggInfo.idaScored ? (
                              <>
                                <span>
                                  <strong>Ida:</strong> {aggInfo.idaMatch.homeTeamName}{" "}
                                  <strong>{aggInfo.idaMatch.homeScore}</strong> ×{" "}
                                  <strong>{aggInfo.idaMatch.awayScore}</strong> {aggInfo.idaMatch.awayTeamName}
                                </span>
                                {aggInfo.aggregateHome !== null && aggInfo.aggregateAway !== null && (
                                  <span>
                                    · <strong>Agregado:</strong> {match.homeTeamName}{" "}
                                    <strong>{aggInfo.aggregateHome}</strong> × <strong>{aggInfo.aggregateAway}</strong>{" "}
                                    {match.awayTeamName}{" "}
                                    {aggInfo.isAggregateTied ? (
                                      <strong style={{ color: "#a16207" }}>(Empate — informe os Pênaltis)</strong>
                                    ) : (
                                      <span style={{ color: "#15803d", fontWeight: 600 }}>
                                        (
                                        {aggInfo.aggregateHome > aggInfo.aggregateAway
                                          ? match.homeTeamName
                                          : match.awayTeamName}{" "}
                                        avança)
                                      </span>
                                    )}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ color: "#a16207", fontWeight: 600 }}>
                                Jogo de Ida ainda sem placar registrado — lance a Ida antes da Volta.
                              </span>
                            )}
                          </div>
                        )}

                        <div className="sports-match-admin-controls">
                          <div className="sports-score-inputs" style={{ flexWrap: "wrap" }}>
                            <strong>{match.homeTeamName}</strong>
                            <input
                              type="number"
                              min={0}
                              aria-label={`Gols de ${match.homeTeamName}`}
                              value={currentScore.home}
                              onChange={(e) =>
                                setScoreInputs((prev) => ({
                                  ...prev,
                                  [match.id]: { ...currentScore, home: e.target.value },
                                }))
                              }
                            />
                            <span>×</span>
                            <input
                              type="number"
                              min={0}
                              aria-label={`Gols de ${match.awayTeamName}`}
                              value={currentScore.away}
                              onChange={(e) =>
                                setScoreInputs((prev) => ({
                                  ...prev,
                                  [match.id]: { ...currentScore, away: e.target.value },
                                }))
                              }
                            />
                            <strong>{match.awayTeamName}</strong>
                          </div>

                          {needsPenalties && (
                            <div className="sports-score-inputs">
                              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Pênaltis:</span>
                              <input
                                type="number"
                                min={0}
                                aria-label={`Pênaltis de ${match.homeTeamName}`}
                                placeholder="5"
                                value={currentPen.home}
                                onChange={(e) =>
                                  setPenaltyInputs((prev) => ({
                                    ...prev,
                                    [match.id]: { ...currentPen, home: e.target.value },
                                  }))
                                }
                              />
                              <span>×</span>
                              <input
                                type="number"
                                min={0}
                                aria-label={`Pênaltis de ${match.awayTeamName}`}
                                placeholder="4"
                                value={currentPen.away}
                                onChange={(e) =>
                                  setPenaltyInputs((prev) => ({
                                    ...prev,
                                    [match.id]: { ...currentPen, away: e.target.value },
                                  }))
                                }
                              />
                            </div>
                          )}

                          <div className="sports-qr-admin">
                            <button
                              type="button"
                              className="button button-primary"
                              disabled={actionBusy}
                              onClick={() => void handleSaveScore(match.id)}
                            >
                              Salvar Resultado
                            </button>
                            {match.status === "SCHEDULED" && (
                              <button
                                type="button"
                                className="button button-secondary"
                                disabled={actionBusy}
                                onClick={() => void handleOpenOrganizerAttendanceModal(match)}
                              >
                                Gerar / Ver Código de Presença
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          )}

          {deadlineModalOpen && (
            <div
              className="sports-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="deadline-modal-title"
              onClick={() => setDeadlineModalOpen(false)}
            >
              <div className="sports-modal" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
                <header className="sports-modal-header">
                  <div>
                    <p className="sports-kicker">Gestão do campeonato</p>
                    <h2 id="deadline-modal-title">Alterar data limite de inscrição</h2>
                  </div>
                  <button
                    type="button"
                    className="sports-modal-close"
                    aria-label="Fechar"
                    onClick={() => setDeadlineModalOpen(false)}
                  >
                    ✕
                  </button>
                </header>
                <div className="sports-modal-body">
                  <form className="sports-create-form" onSubmit={(e) => void handleUpdateDeadline(e)}>
                    <label className="sports-field">
                      <span>Nova data e horário limite para inscrições</span>
                      <input
                        type="datetime-local"
                        required
                        value={newDeadlineLocal}
                        onChange={(e) => setNewDeadlineLocal(e.target.value)}
                      />
                    </label>
                    <div className="sports-form-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setDeadlineModalOpen(false)}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="button button-primary" disabled={actionBusy}>
                        {actionBusy ? "Salvando…" : "Salvar nova data"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}

          {cancelModalOpen && (
            <div
              className="sports-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-tournament-modal-title"
              onClick={() => setCancelModalOpen(false)}
            >
              <div className="sports-modal" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
                <header className="sports-modal-header">
                  <div>
                    <p className="sports-kicker">Ação irreversível · Saga de Estorno</p>
                    <h2 id="cancel-tournament-modal-title">Cancelar campeonato e estornar inscrições?</h2>
                  </div>
                  <button
                    type="button"
                    className="sports-modal-close"
                    aria-label="Fechar"
                    onClick={() => setCancelModalOpen(false)}
                  >
                    ✕
                  </button>
                </header>
                <div className="sports-modal-body">
                  <p style={{ margin: 0, lineHeight: 1.55 }}>
                    Ao confirmar o cancelamento de <strong>{item.title}</strong>:
                  </p>
                  <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", lineHeight: 1.6, fontSize: "0.92rem" }}>
                    <li>
                      O campeonato passa imediatamente para o estado <strong>Cancelado</strong>;
                    </li>
                    <li>Todas as equipes ({confirmedTeams.length}) e atletas avulsos inscritos serão cancelados;</li>
                    <li>
                      Todo pagamento <strong>PIX já confirmado</strong> será estornado automaticamente (
                      <strong>REFUNDED</strong>) via <strong>Outbox + RabbitMQ → Payment Service (Saga)</strong>.
                    </li>
                  </ul>
                  <div className="sports-form-actions" style={{ marginTop: "1rem" }}>
                    <button type="button" className="button button-secondary" onClick={() => setCancelModalOpen(false)}>
                      Voltar
                    </button>
                    <button
                      type="button"
                      className="button sports-danger-button"
                      disabled={actionBusy}
                      onClick={() => void handleCancelTournament()}
                    >
                      {actionBusy ? "Cancelando e solicitando estornos…" : "Confirmar Cancelamento & Estorno PIX"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {attendanceModal.open && (
            <UniversalAttendanceModal
              mode={attendanceModal.mode}
              busy={attendanceModal.loadingCode || actionBusy}
              title={
                attendanceModal.mode === "organizer"
                  ? "Código e QR de Presença da Partida"
                  : "Confirmar Presença na Partida"
              }
              subtitle={
                attendanceModal.match
                  ? `${attendanceModal.match.homeTeamName} × ${attendanceModal.match.awayTeamName} (${roundButtonLabel(contextType, attendanceModal.match.roundNumber)})`
                  : ""
              }
              token={attendanceModal.generatedCode}
              onGenerateToken={
                attendanceModal.mode === "organizer" && attendanceModal.match
                  ? () => void handleOpenOrganizerAttendanceModal(attendanceModal.match!)
                  : undefined
              }
              onSubmitToken={(code) => void handleConfirmMatchAttendanceCode(code)}
              onClose={() => setAttendanceModal((prev) => ({ ...prev, open: false }))}
            />
          )}
        </>
      )}
    </div>
  );
}
