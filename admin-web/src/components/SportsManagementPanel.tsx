import { AdminFeedback } from "./AdminFeedback";
import { AdminModal } from "./AdminModal";
import { MatchAttendanceModal } from "./MatchAttendanceModal";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type Keycloak from "keycloak-js";
import { useToast } from "../contexts/ToastContext";
import { extractErrorMessage } from "../utils/apiError";
import {
  cancelAdminSportsEvent,
  createAdminCompetition,
  createAdminSeason,
  createAdminSport,
  generateAdminSportsMatches,
  getSportsAdminCatalog,
  getSportsAdminOverview,
  saveAdminSportsScore,
  SportsAdminApiError,
  updateAdminSportsEvent,
  type SportsAdminCatalog,
  type SportsAdminEvent,
  type SportsAdminOverview,
} from "../services/sportsAdmin";

type CreateKind = "sport" | "competition" | "season";
type EventRef = { kind: "COMPETITION" | "SEASON"; item: SportsAdminEvent };

interface SportsManagementPanelProps {
  gatewayUrl: string;
  keycloak: Keycloak;
}

const EMPTY_CATALOG: SportsAdminCatalog = {
  sports: { items: [], totalElements: 0 },
  organizerContexts: { items: [] },
  competitions: { items: [], totalElements: 0 },
  seasons: { items: [], totalElements: 0 },
};

type MatchScoreDraft = { home: string; away: string; homePenalty: string; awayPenalty: string };

function defaultDeadline(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function localDateTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function SportsManagementPanel({ gatewayUrl, keycloak }: SportsManagementPanelProps) {
  const toast = useToast();
  const [catalog, setCatalog] = useState<SportsAdminCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<EventRef | null>(null);
  const [overview, setOverview] = useState<SportsAdminOverview | null>(null);
  const [deadline, setDeadline] = useState("");
  const [firstMatchAt, setFirstMatchAt] = useState("");
  const [location, setLocation] = useState("");
  const [penaltyMatches, setPenaltyMatches] = useState<Record<string, boolean>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, MatchScoreDraft>>({});
  const [round, setRound] = useState(1);

  const [sportName, setSportName] = useState("");
  const [playersOnField, setPlayersOnField] = useState("5");
  const [minimumRoster, setMinimumRoster] = useState("5");
  const [maximumRoster, setMaximumRoster] = useState("12");
  const [allowsDraw, setAllowsDraw] = useState(true);
  const [rulesMarkdown, setRulesMarkdown] = useState("");
  const [winPoints, setWinPoints] = useState("3");
  const [drawPoints, setDrawPoints] = useState("1");
  const [forfeitScore, setForfeitScore] = useState("3");
  const [eventTitle, setEventTitle] = useState("");
  const [sportId, setSportId] = useState("");
  const [teamEntryPrice, setTeamEntryPrice] = useState("0");
  const [freeAgentPrice, setFreeAgentPrice] = useState("0");
  const [createDeadline, setCreateDeadline] = useState(defaultDeadline);
  const [organizerKey, setOrganizerKey] = useState("");
  const [catalogSection, setCatalogSection] = useState<"sports" | "competitions" | "seasons">("competitions");
  const [catalogPage, setCatalogPage] = useState(0);
  const [attendanceMatchId, setAttendanceMatchId] = useState<string | null>(null);
  const organizerContexts = catalog.organizerContexts.items;
  const confirmedTeams = overview?.teams.filter((team) => !team.placeholder) ?? [];
  const queuedFreeAgents = overview?.freeAgents.filter((agent) => agent.status === "QUEUED") ?? [];
  const attendanceMatch = overview?.matches.find((match) => match.id === attendanceMatchId) ?? null;

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão administrativa indisponível.");
      const result = await getSportsAdminCatalog(gatewayUrl, keycloak.token, catalogSection, catalogPage);
      setCatalog(result);
      setOrganizerKey((current) =>
        current &&
        result.organizerContexts.items.some((item) => `${item.organizerType}:${item.organizerId}` === current)
          ? current
          : result.organizerContexts.items[0]
            ? `${result.organizerContexts.items[0].organizerType}:${result.organizerContexts.items[0].organizerId}`
            : "",
      );
      setSportId((current) =>
        result.sports.items.some((sport) => sport.id === current) ? current : (result.sports.items[0]?.id ?? ""),
      );
    } catch (loadError) {
      toast.error(extractErrorMessage(loadError, "Não foi possível carregar a gestão esportiva."));
    } finally {
      setLoading(false);
    }
  }, [gatewayUrl, keycloak, catalogSection, catalogPage, toast]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const loadEventOverview = useCallback(
    async (eventRef: EventRef) => {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão administrativa indisponível.");
      const result = await getSportsAdminOverview(gatewayUrl, keycloak.token, eventRef.kind, eventRef.item.id);
      setOverview(result);
      setDeadline(localDateTime(result.registrationDeadline));
      setScoreDrafts(
        Object.fromEntries(
          result.matches.map((match) => [
            match.id,
            {
              home: String(match.homeScore ?? ""),
              away: String(match.awayScore ?? ""),
              homePenalty: String(match.homePenaltyScore ?? ""),
              awayPenalty: String(match.awayPenaltyScore ?? ""),
            },
          ]),
        ),
      );
    },
    [gatewayUrl, keycloak],
  );

  async function openEvent(eventRef: EventRef) {
    setPenaltyMatches({});
    setSelectedEvent(eventRef);
    setAttendanceMatchId(null);
    setRound(1);
    setOverview(null);
    try {
      await loadEventOverview(eventRef);
    } catch (loadError) {
      toast.error(extractErrorMessage(loadError, "Não foi possível abrir o campeonato."));
    }
  }

  function openCreate(kind: CreateKind) {
    setCreateKind(kind);
    setEventTitle("");
    setCreateDeadline(defaultDeadline());
    setSportName("");
    setRulesMarkdown("");
    setWinPoints("3");
    setDrawPoints("1");
    setForfeitScore("3");
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await keycloak.updateToken(30);
    if (!keycloak.token) return;
    setBusy(true);
    try {
      const organizer = organizerContexts.find((item) => `${item.organizerType}:${item.organizerId}` === organizerKey);
      if (!organizer) throw new Error("Selecione um contexto organizador.");
      if (createKind === "sport") {
        const createdSport = await createAdminSport(gatewayUrl, keycloak.token, {
          name: sportName.trim(),
          playersOnField: Number(playersOnField),
          minimumRoster: Number(minimumRoster),
          maximumRoster: Number(maximumRoster),
          allowsDraw,
          winPoints: Number(winPoints),
          drawPoints: allowsDraw ? Number(drawPoints) : 0,
          lossPoints: 0,
          defaultForfeitScore: Number(forfeitScore),
          rulesMarkdown: rulesMarkdown.trim(),
          createdByType: organizer.organizerType,
          createdById: organizer.organizerId,
        });
        setSportId(createdSport.id);
      } else {
        if (!sportId) throw new Error("Selecione uma modalidade.");
        const payload = {
          title: eventTitle.trim(),
          sportId,
          skillLevel: "COMPETITIVE",
          organizerType: organizer.organizerType,
          organizerId: organizer.organizerId,
          teamEntryPrice: Math.round(Number(teamEntryPrice.replace(",", ".")) * 100),
          freeAgentPrice: Math.round(Number(freeAgentPrice.replace(",", ".")) * 100),
          registrationDeadline: new Date(createDeadline).toISOString(),
        };
        if (createKind === "competition") await createAdminCompetition(gatewayUrl, keycloak.token, payload);
        else await createAdminSeason(gatewayUrl, keycloak.token, payload);
      }
      setCreateKind(null);
      toast.success(
        createKind === "sport"
          ? "Modalidade criada."
          : createKind === "competition"
            ? "Campeonato criado."
            : "Temporada criada.",
      );
      await loadCatalog();
    } catch (createError) {
      toast.error(extractErrorMessage(createError, "Não foi possível salvar o registro esportivo."));
    } finally {
      setBusy(false);
    }
  }

  async function runEventAction(action: () => Promise<unknown>, success: string) {
    if (!selectedEvent || !keycloak.token) return;
    setBusy(true);
    try {
      await keycloak.updateToken(30);
      await action();
      await loadEventOverview(selectedEvent);
      await loadCatalog();
      toast.success(success);
    } catch (actionError) {
      toast.error(extractErrorMessage(actionError, "Não foi possível concluir a operação."));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateDeadline() {
    if (!selectedEvent || !keycloak.token || !deadline) return;
    await runEventAction(
      () =>
        updateAdminSportsEvent(gatewayUrl, keycloak.token!, selectedEvent.kind, selectedEvent.item.id, {
          registrationDeadline: new Date(deadline).toISOString(),
        }),
      "Prazo de inscrição atualizado.",
    );
  }

  async function handleSelectChampion(teamId: string) {
    if (!selectedEvent || !keycloak.token) return;
    await runEventAction(
      () =>
        updateAdminSportsEvent(gatewayUrl, keycloak.token!, selectedEvent.kind, selectedEvent.item.id, {
          championTeamId: teamId,
        }),
      "Equipe campeã registrada.",
    );
  }

  async function handleCancelEvent() {
    if (!selectedEvent || !keycloak.token || !window.confirm(`Cancelar “${selectedEvent.item.title}”?`)) return;
    await runEventAction(
      () => cancelAdminSportsEvent(gatewayUrl, keycloak.token!, selectedEvent.kind, selectedEvent.item.id),
      "Campeonato cancelado.",
    );
  }

  async function handleGenerateMatches() {
    if (!selectedEvent || !keycloak.token || !firstMatchAt || !location.trim()) return;
    const start = new Date(`${firstMatchAt}-03:00`);
    setBusy(true);
    try {
      await keycloak.updateToken(30);
      await generateAdminSportsMatches(gatewayUrl, keycloak.token!, selectedEvent.kind, selectedEvent.item.id, {
        firstMatchAt: start.toISOString(),
        location: location.trim(),
      });
      await loadEventOverview(selectedEvent);
      toast.success("Tabela de partidas gerada.");
    } catch (error) {
      toast.error(extractErrorMessage(error, "Não foi possível gerar a tabela."));
    } finally {
      setBusy(false);
    }
  }

  function updateRegularScore(matchId: string, draft: MatchScoreDraft, side: "home" | "away", value: string) {
    setPenaltyMatches((previous) => ({ ...previous, [matchId]: false }));
    setScoreDrafts((previous) => ({
      ...previous,
      [matchId]: { ...draft, [side]: value, homePenalty: "", awayPenalty: "" },
    }));
  }

  async function handleSaveScore(matchId: string) {
    if (!keycloak.token) return;
    const current = scoreDrafts[matchId];
    if (!current || current.home === "" || current.away === "") return;
    if (!selectedEvent) return;
    const includePenalties = penaltyMatches[matchId] === true;
    setBusy(true);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      await saveAdminSportsScore(gatewayUrl, keycloak.token, matchId, {
        homeScore: Number(current.home),
        awayScore: Number(current.away),
        ...(includePenalties && current.homePenalty !== "" && current.awayPenalty !== ""
          ? { homePenaltyScore: Number(current.homePenalty), awayPenaltyScore: Number(current.awayPenalty) }
          : {}),
      });
      setPenaltyMatches((previous) => ({ ...previous, [matchId]: false }));
      await loadEventOverview(selectedEvent);
      toast.success("Placar salvo.");
    } catch (error) {
      if (error instanceof SportsAdminApiError && error.code === "PENALTIES_REQUIRED") {
        setPenaltyMatches((previous) => ({ ...previous, [matchId]: true }));
      }
      toast.error(extractErrorMessage(error, "Não foi possível salvar o placar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="admin-card admin-sports-card" aria-labelledby="sports-admin-title">
        <div className="admin-directory-heading">
          <div>
            <span className="admin-eyebrow">Gestão esportiva</span>
            <h2 id="sports-admin-title">Modalidades e campeonatos</h2>
            <p className="admin-sports-intro">
              Cadastre esportes, organize inscrições e cuide da tabela e dos resultados.
            </p>
          </div>
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => void loadCatalog()}>
            Atualizar
          </button>
        </div>
        <div className="admin-sports-toolbar">
          <div className="admin-tabs" aria-label="Catálogo esportivo">
            {(
              [
                ["sports", "Modalidades"],
                ["competitions", "Campeonatos"],
                ["seasons", "Temporadas"],
              ] as const
            ).map(([section, label]) => (
              <button
                key={section}
                type="button"
                className={catalogSection === section ? "is-active" : ""}
                aria-pressed={catalogSection === section}
                onClick={() => {
                  setCatalogSection(section);
                  setCatalogPage(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="admin-sports-actions">
            <button
              type="button"
              className="btn-primary"
              disabled={loading || !organizerContexts.length}
              onClick={() => openCreate("sport")}
            >
              + Modalidade
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={loading || !organizerContexts.length || !catalog.sports.items.length}
              onClick={() => openCreate("competition")}
            >
              + Campeonato
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={loading || !organizerContexts.length || !catalog.sports.items.length}
              onClick={() => openCreate("season")}
            >
              + Temporada
            </button>
          </div>
        </div>
        {loading && <AdminFeedback tone="info">Carregando catálogo esportivo…</AdminFeedback>}
        {!loading && !organizerContexts.length && (
          <p className="admin-empty-note">Nenhum contexto organizador está disponível para esta conta.</p>
        )}
        {!loading && (
          <section>
            {catalogSection === "sports"
              ? catalog.sports.items.map((sport) => (
                  <div className="admin-sports-row" key={sport.id}>
                    <strong>{sport.name}</strong>
                    <small>
                      {sport.playersOnField} por equipe · elenco {sport.minimumRoster}–{sport.maximumRoster}
                    </small>
                  </div>
                ))
              : catalog[catalogSection].items.map((item) => (
                  <div className="admin-sports-row admin-sports-event-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <small>
                        {item.sportName} · {item.status ?? "Aguardando"}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        void openEvent({
                          kind: catalogSection === "competitions" ? "COMPETITION" : "SEASON",
                          item,
                        })
                      }
                    >
                      Gerenciar
                    </button>
                  </div>
                ))}
            {!catalog[catalogSection].items.length && <p className="admin-empty-note">Nenhum registro nesta página.</p>}
            <div className="admin-form-actions" aria-label="Paginação do catálogo">
              <button
                type="button"
                className="btn-secondary"
                disabled={catalogPage === 0}
                onClick={() => setCatalogPage(catalogPage - 1)}
              >
                Anterior
              </button>
              <span>
                Página {catalogPage + 1} · {catalog[catalogSection].totalElements} registros
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={(catalogPage + 1) * 8 >= catalog[catalogSection].totalElements}
                onClick={() => setCatalogPage(catalogPage + 1)}
              >
                Próxima
              </button>
            </div>
          </section>
        )}
      </section>

      {createKind && (
        <AdminModal
          eyebrow="Gestão esportiva"
          title={
            createKind === "sport"
              ? "Nova modalidade"
              : createKind === "competition"
                ? "Novo campeonato"
                : "Nova temporada"
          }
          closeDisabled={busy}
          onClose={() => setCreateKind(null)}
        >
          <form className="admin-form admin-dialog-form" onSubmit={(event) => void handleCreate(event)}>
            {createKind === "sport" ? (
              <>
                <label>
                  <span>Nome da modalidade</span>
                  <input required value={sportName} onChange={(event) => setSportName(event.target.value)} />
                </label>
                <div className="admin-form-row">
                  <label>
                    <span>Jogadores em campo</span>
                    <input
                      required
                      min="1"
                      type="number"
                      value={playersOnField}
                      onChange={(event) => setPlayersOnField(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Elenco mínimo</span>
                    <input
                      required
                      min="1"
                      type="number"
                      value={minimumRoster}
                      onChange={(event) => setMinimumRoster(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Elenco máximo</span>
                    <input
                      required
                      min={minimumRoster}
                      type="number"
                      value={maximumRoster}
                      onChange={(event) => setMaximumRoster(event.target.value)}
                    />
                  </label>
                </div>
                <div className="admin-form-row">
                  <label>
                    <span>Pontos por vitória</span>
                    <input
                      required
                      min="0"
                      type="number"
                      value={winPoints}
                      onChange={(event) => setWinPoints(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Pontos por empate</span>
                    <input
                      min="0"
                      type="number"
                      disabled={!allowsDraw}
                      value={allowsDraw ? drawPoints : "0"}
                      onChange={(event) => setDrawPoints(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Placar de W.O.</span>
                    <input
                      required
                      min="0"
                      type="number"
                      value={forfeitScore}
                      onChange={(event) => setForfeitScore(event.target.value)}
                    />
                  </label>
                </div>
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={allowsDraw}
                    onChange={(event) => setAllowsDraw(event.target.checked)}
                  />
                  <span>Permite empate</span>
                </label>
                <label>
                  <span>Regulamento</span>
                  <textarea
                    required
                    rows={4}
                    value={rulesMarkdown}
                    onChange={(event) => setRulesMarkdown(event.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  <span>Título</span>
                  <input required value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
                </label>
                <label>
                  <span>Modalidade</span>
                  <select required value={sportId} onChange={(event) => setSportId(event.target.value)}>
                    <option value="">Selecione…</option>
                    {catalog.sports.items.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Organizador</span>
                  <select required value={organizerKey} onChange={(event) => setOrganizerKey(event.target.value)}>
                    {organizerContexts.map((context) => (
                      <option
                        key={`${context.organizerType}:${context.organizerId}`}
                        value={`${context.organizerType}:${context.organizerId}`}
                      >
                        {context.name} ({context.organizerType})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="admin-form-row">
                  <p>
                    {createKind === "competition"
                      ? "32 times · Grupos de quatro · Sábados e domingos"
                      : "10 times · Turno e returno · Terças e quintas"}
                  </p>
                  <label>
                    <span>Inscrição por equipe (R$)</span>
                    <input
                      min="0"
                      step="0.01"
                      type="number"
                      value={teamEntryPrice}
                      onChange={(event) => setTeamEntryPrice(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Inscrição individual (R$)</span>
                    <input
                      min="0"
                      step="0.01"
                      type="number"
                      value={freeAgentPrice}
                      onChange={(event) => setFreeAgentPrice(event.target.value)}
                    />
                  </label>
                </div>
                <label>
                  <span>Prazo de inscrição</span>
                  <input
                    required
                    type="datetime-local"
                    value={createDeadline}
                    onChange={(event) => setCreateDeadline(event.target.value)}
                  />
                </label>
              </>
            )}
            <div className="admin-dialog-actions">
              <button type="button" className="btn-secondary" onClick={() => setCreateKind(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={busy || !organizerContexts.length || (createKind !== "sport" && !catalog.sports.items.length)}
              >
                {busy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {selectedEvent && (
        <AdminModal
          size="wide"
          eyebrow={selectedEvent.kind === "COMPETITION" ? "Campeonato" : "Temporada"}
          title={selectedEvent.item.title}
          onClose={() => setSelectedEvent(null)}
        >
          <div className="admin-dialog-content">
            {!overview ? (
              <AdminFeedback tone="info">Carregando campeonato…</AdminFeedback>
            ) : (
              <>
                <div className="admin-sports-manage-grid">
                  <form
                    className="admin-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleUpdateDeadline();
                    }}
                  >
                    <h3>Inscrições</h3>
                    <label>
                      <span>Prazo</span>
                      <input
                        required
                        type="datetime-local"
                        value={deadline}
                        onChange={(event) => setDeadline(event.target.value)}
                      />
                    </label>
                    <button className="btn-primary" disabled={busy} type="submit">
                      Atualizar prazo
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={busy || overview.status === "CANCELLED"}
                      onClick={() => void handleCancelEvent()}
                      type="button"
                    >
                      Cancelar campeonato
                    </button>
                    <p className="admin-empty-note">{confirmedTeams.length} equipe(s) inscrita(s).</p>
                  </form>
                  <form
                    className="admin-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleGenerateMatches();
                    }}
                  >
                    <h3>Gerar tabela</h3>
                    <label>
                      <span>Primeira partida (horário de Brasília)</span>
                      <input
                        required
                        type="datetime-local"
                        value={firstMatchAt}
                        onChange={(event) => setFirstMatchAt(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Local</span>
                      <input required value={location} onChange={(event) => setLocation(event.target.value)} />
                    </label>
                    <button className="btn-primary" disabled={busy || !overview.canGenerateMatches} type="submit">
                      {busy ? "Processando…" : "Gerar partidas"}
                    </button>
                    {overview.matches.length > 0 && <p className="admin-empty-note">A tabela já foi gerada.</p>}
                    {!overview.canGenerateMatches && overview.matches.length === 0 && (
                      <p className="admin-empty-note">
                        Confirme todas as equipes e complete os elencos antes de gerar as partidas.
                      </p>
                    )}
                  </form>
                </div>
                <section className="admin-sports-registrations">
                  <div className="admin-directory-heading">
                    <div>
                      <h3>
                        Equipes inscritas{" "}
                        <span>
                          {confirmedTeams.length}/{overview.targetTeamCount}
                        </span>
                      </h3>
                      <p className="admin-empty-note">
                        Elenco mínimo de {overview.rosterMin} e máximo de {overview.rosterMax} atletas.
                      </p>
                    </div>
                    <span className="admin-count-pill">{queuedFreeAgents.length} free agent(s) na fila</span>
                  </div>
                  {confirmedTeams.length ? (
                    <div className="admin-sports-team-list">
                      {confirmedTeams.map((team) => {
                        const captain = team.members.find((member) => member.role === "CAPTAIN")?.displayName ?? "—";
                        const ready = team.rosterComplete;
                        return (
                          <article className="admin-sports-team" key={team.id}>
                            <div className="admin-sports-team-heading">
                              <div>
                                <strong>{team.name}</strong>
                                <span>Capitão: {captain}</span>
                              </div>
                              <span className={ready ? "admin-status-pill is-ready" : "admin-status-pill"}>
                                {team.members.length}/{overview.rosterMax} atletas ·{" "}
                                {ready ? "Elenco completo" : "Montando elenco"}
                              </span>
                            </div>
                            <ul>
                              {team.members.map((member) => (
                                <li key={member.id}>
                                  {member.displayName}
                                  <small>
                                    {member.role === "CAPTAIN"
                                      ? "Capitão"
                                      : member.role === "FREE_AGENT"
                                        ? "Free agent"
                                        : "Atleta"}
                                  </small>
                                </li>
                              ))}
                            </ul>
                            {team.inviteCode && (
                              <p className="admin-sports-invite">
                                Código {team.inviteActive ? "ativo" : "expirado"}: <code>{team.inviteCode}</code>
                                {team.inviteExpiresAt && (
                                  <> · válido até {new Date(team.inviteExpiresAt).toLocaleString("pt-BR")}</>
                                )}
                              </p>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="admin-empty-note">Nenhuma equipe inscrita ainda.</p>
                  )}
                  <h4>Inscrições individuais</h4>
                  {overview.freeAgents.length ? (
                    <ul className="admin-sports-free-agents">
                      {overview.freeAgents.map((agent) => {
                        const team = confirmedTeams.find((candidate) => candidate.id === agent.allocatedTeamId);
                        return (
                          <li key={agent.id}>
                            <span>{agent.displayName}</span>
                            <small>
                              {agent.status === "QUEUED"
                                ? "Aguardando vaga"
                                : `Alocado a ${team?.name ?? "uma equipe"}`}
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="admin-empty-note">Nenhum atleta inscrito individualmente.</p>
                  )}
                </section>
                <section className="admin-sports-matches">
                  {overview.championTeamId && (
                    <AdminFeedback tone="success">
                      Equipe campeã · {overview.teams.find((team) => team.id === overview.championTeamId)?.name}
                    </AdminFeedback>
                  )}
                  {overview.manualChampionCandidates?.length > 0 && (
                    <div className="admin-form-actions">
                      <AdminFeedback tone="info">
                        O primeiro lugar continua empatado após todos os critérios. Selecione a equipe campeã.
                      </AdminFeedback>
                      {overview.teams
                        .filter((team) => overview.manualChampionCandidates.includes(team.id))
                        .map((team) => (
                          <button
                            key={team.id}
                            type="button"
                            className="btn-secondary"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Registrar “${team.name}” como equipe campeã?`)) {
                                void handleSelectChampion(team.id);
                              }
                            }}
                          >
                            {team.name}
                          </button>
                        ))}
                    </div>
                  )}
                  <h3>
                    Partidas <span>{overview.matches.length}</span>
                  </h3>
                  {!!overview.matches.length && (
                    <label className="admin-form">
                      <span>Rodada</span>
                      <select value={round} onChange={(event) => setRound(Number(event.target.value))}>
                        {[
                          ...new Map(overview.matches.map((match) => [match.roundNumber, match.roundLabel])).entries(),
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label ?? `Rodada ${value}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {overview.matches.length ? (
                    overview.matches
                      .filter((match) => match.roundNumber === round)
                      .map((match) => {
                        const draft = scoreDrafts[match.id] ?? {
                          home: String(match.homeScore ?? ""),
                          away: String(match.awayScore ?? ""),
                          homePenalty: String(match.homePenaltyScore ?? ""),
                          awayPenalty: String(match.awayPenaltyScore ?? ""),
                        };
                        const penaltyRequired = penaltyMatches[match.id] === true;
                        return (
                          <div className="admin-match-row" key={match.id}>
                            <div className="admin-match-heading">
                              <strong>
                                {match.homeTeamName} × {match.awayTeamName}
                              </strong>
                              <small>
                                Rodada {match.roundNumber} ·{" "}
                                {new Date(match.scheduledAt).toLocaleString("pt-BR", {
                                  timeZone: "America/Sao_Paulo",
                                })}{" "}
                                · {match.location} · {match.checkinCount} presença(s)
                              </small>
                            </div>
                            <div className="admin-match-controls">
                              <input
                                aria-label={`Placar ${match.homeTeamName}`}
                                type="number"
                                min="0"
                                value={draft.home}
                                onChange={(event) => updateRegularScore(match.id, draft, "home", event.target.value)}
                              />
                              <span>×</span>
                              <input
                                aria-label={`Placar ${match.awayTeamName}`}
                                type="number"
                                min="0"
                                value={draft.away}
                                onChange={(event) => updateRegularScore(match.id, draft, "away", event.target.value)}
                              />
                              {penaltyRequired && (
                                <>
                                  <label className="admin-penalty-input">
                                    Pênaltis
                                    <input
                                      aria-label={`Pênaltis ${match.homeTeamName}`}
                                      type="number"
                                      min="0"
                                      value={draft.homePenalty}
                                      onChange={(event) =>
                                        setScoreDrafts((current) => ({
                                          ...current,
                                          [match.id]: { ...draft, homePenalty: event.target.value },
                                        }))
                                      }
                                    />
                                  </label>
                                  <span>×</span>
                                  <input
                                    aria-label={`Pênaltis ${match.awayTeamName}`}
                                    type="number"
                                    min="0"
                                    value={draft.awayPenalty}
                                    onChange={(event) =>
                                      setScoreDrafts((current) => ({
                                        ...current,
                                        [match.id]: { ...draft, awayPenalty: event.target.value },
                                      }))
                                    }
                                  />
                                </>
                              )}
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy || !match.viewerCanEditScore || draft.home === "" || draft.away === ""}
                                onClick={() => void handleSaveScore(match.id)}
                              >
                                Salvar placar
                              </button>
                              {(match.viewerCanManageQr || match.viewerCanReviewAttendance) && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  disabled={busy}
                                  onClick={() => setAttendanceMatchId(match.id)}
                                >
                                  Presença e QR
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <p className="admin-empty-note">A tabela de partidas ainda não foi gerada.</p>
                  )}
                </section>
              </>
            )}
          </div>
        </AdminModal>
      )}
      {attendanceMatch && selectedEvent && (
        <MatchAttendanceModal
          gatewayUrl={gatewayUrl}
          keycloak={keycloak}
          match={attendanceMatch}
          onChanged={() => loadEventOverview(selectedEvent)}
          onClose={() => setAttendanceMatchId(null)}
        />
      )}
    </>
  );
}
