import { useState, type FormEvent } from "react";
import type Keycloak from "keycloak-js";
import {
  createCompetition,
  createSeason,
  createSport,
  SportsApiError,
  type Sport,
  type SportsOrganizerContext,
} from "../services/sports.js";

interface SportsCreateModalProps {
  keycloak: Keycloak;
  sports: Sport[];
  organizerContexts: SportsOrganizerContext[];
  onClose: () => void;
  onCreated: () => void;
}

export function SportsCreateModal({ keycloak, sports, organizerContexts, onClose, onCreated }: SportsCreateModalProps) {
  const [tab, setTab] = useState<"event" | "sport">(sports.length > 0 ? "event" : "sport");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultOrgKey = organizerContexts[0]
    ? `${organizerContexts[0].organizerType}:${organizerContexts[0].organizerId}`
    : "";

  // Competition / Season fields
  const [eventKind, setEventKind] = useState<"COMPETITION" | "SEASON">("COMPETITION");
  const [title, setTitle] = useState("");
  const [sportId, setSportId] = useState(sports[0]?.id ?? "");
  const skillLevel = "COMPETITIVE" as const;
  const [organizerKey, setOrganizerKey] = useState(defaultOrgKey);
  const [teamPriceReais, setTeamPriceReais] = useState("0");
  const [freeAgentPriceReais, setFreeAgentPriceReais] = useState("0");
  const [deadlineDate, setDeadlineDate] = useState("2027-06-30");

  // New Sport fields
  const [sportName, setSportName] = useState("");
  const [playersOnField, setPlayersOnField] = useState("5");
  const [minimumRoster, setMinimumRoster] = useState("5");
  const [maximumRoster, setMaximumRoster] = useState("12");
  const [allowsDraw, setAllowsDraw] = useState(true);
  const [winPoints, setWinPoints] = useState("3");
  const [drawPoints, setDrawPoints] = useState("1");
  const [forfeitScore, setForfeitScore] = useState("3");
  const [rulesMarkdown, setRulesMarkdown] = useState("");

  function selectedOrganizer(): SportsOrganizerContext | undefined {
    const [type, id] = organizerKey.split(":");
    return organizerContexts.find((ctx) => ctx.organizerType === type && ctx.organizerId === id);
  }

  async function handleCreateEvent(event: FormEvent) {
    event.preventDefault();
    const org = selectedOrganizer();
    if (!org || !sportId) {
      setError("Selecione uma modalidade e um organizador.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const teamEntryPrice = Math.round(Number(teamPriceReais.replace(",", ".")) * 100) || 0;
      const freeAgentPrice = Math.round(Number(freeAgentPriceReais.replace(",", ".")) * 100) || 0;
      const registrationDeadline = new Date(`${deadlineDate}T23:59:00Z`).toISOString();

      if (eventKind === "COMPETITION") {
        await createCompetition(keycloak.token, {
          title: title.trim(),
          sportId,
          skillLevel,
          organizerType: org.organizerType,
          organizerId: org.organizerId,
          targetTeamCount: 32,
          teamEntryPrice,
          freeAgentPrice,
          registrationDeadline,
        });
      } else {
        await createSeason(keycloak.token, {
          title: title.trim(),
          sportId,
          skillLevel,
          organizerType: org.organizerType,
          organizerId: org.organizerId,
          targetTeamCount: 10,
          teamEntryPrice,
          freeAgentPrice,
          registrationDeadline,
        });
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof SportsApiError ? err.message : "Não foi possível criar o campeonato/temporada.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSport(event: FormEvent) {
    event.preventDefault();
    const org = selectedOrganizer();
    if (!org) {
      setError("Selecione um contexto organizador.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada.");
      const created = await createSport(keycloak.token, {
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
        createdByType: org.organizerType,
        createdById: org.organizerId,
      });
      setSportId(created.id);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof SportsApiError ? err.message : "Não foi possível cadastrar a modalidade.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sports-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sports-modal" onClick={(event) => event.stopPropagation()}>
        <header className="sports-modal-header">
          <div>
            <p className="sports-kicker">Gestão esportiva</p>
            <h2>Criar no módulo de Esportes</h2>
          </div>
          <button type="button" className="sports-modal-close" aria-label="Fechar" onClick={onClose}>
            ✕
          </button>
        </header>

        <nav className="sports-modal-tabs" aria-label="Tipo de criação">
          <button type="button" className={tab === "event" ? "is-active" : ""} onClick={() => setTab("event")}>
            Campeonato ou Temporada
          </button>
          <button type="button" className={tab === "sport" ? "is-active" : ""} onClick={() => setTab("sport")}>
            Nova Modalidade
          </button>
        </nav>

        <div className="sports-modal-body">
          {error && (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          )}

          {tab === "event" ? (
            <form className="sports-create-form" onSubmit={(e) => void handleCreateEvent(e)}>
              <div className="sports-form-row">
                <label className="sports-field">
                  <span>Tipo</span>
                  <select value={eventKind} onChange={(e) => setEventKind(e.target.value as "COMPETITION" | "SEASON")}>
                    <option value="COMPETITION">Campeonato (Grupos + Mata-mata)</option>
                    <option value="SEASON">Temporada (Pontos corridos)</option>
                  </select>
                </label>
                <label className="sports-field">
                  <span>Modalidade</span>
                  <select required value={sportId} onChange={(e) => setSportId(e.target.value)}>
                    <option value="" disabled>
                      Selecione…
                    </option>
                    {sports.map((sport) => (
                      <option key={sport.id} value={sport.id}>
                        {sport.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="sports-field">
                <span>Título</span>
                <input
                  type="text"
                  required
                  maxLength={200}
                  placeholder="Ex: Copa UFLA de Futsal 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <div className="sports-form-row">
                <label className="sports-field">
                  <span>Organizador</span>
                  <select value={organizerKey} onChange={(e) => setOrganizerKey(e.target.value)}>
                    {organizerContexts.map((ctx) => (
                      <option
                        key={`${ctx.organizerType}:${ctx.organizerId}`}
                        value={`${ctx.organizerType}:${ctx.organizerId}`}
                      >
                        {ctx.name} ({ctx.organizerType})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="sports-field">
                  <span>Categoria</span>
                  <input type="text" readOnly value="Misto · Competitivo Único" />
                </label>
              </div>

              <div className="sports-form-row">
                <label className="sports-field">
                  <span>Formato e Calendário Semestral (4 meses)</span>
                  <input
                    type="text"
                    readOnly
                    value={
                      eventKind === "COMPETITION"
                        ? "32 equipes · Mata-mata aos Finais de Semana (Sáb/Dom)"
                        : "10 equipes · 18 rodadas em Dias de Semana (Ter/Qui, ≥ 2 dias descanso)"
                    }
                  />
                </label>

                <label className="sports-field">
                  <span>Prazo de inscrição</span>
                  <input type="date" required value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)} />
                </label>
              </div>

              <div className="sports-form-row">
                <label className="sports-field">
                  <span>Taxa por equipe (R$)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={teamPriceReais}
                    onChange={(e) => setTeamPriceReais(e.target.value)}
                  />
                </label>
                <label className="sports-field">
                  <span>Taxa Free Agent (R$)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={freeAgentPriceReais}
                    onChange={(e) => setFreeAgentPriceReais(e.target.value)}
                  />
                </label>
              </div>

              <div className="sports-form-actions">
                <button type="button" className="button button-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="button button-primary" disabled={busy || sports.length === 0}>
                  {busy ? "Salvando…" : "Publicar"}
                </button>
              </div>
            </form>
          ) : (
            <form className="sports-create-form" onSubmit={(e) => void handleCreateSport(e)}>
              <div className="sports-form-row">
                <label className="sports-field">
                  <span>Nome da modalidade</span>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    placeholder="Ex: Handebol"
                    value={sportName}
                    onChange={(e) => setSportName(e.target.value)}
                  />
                </label>
                <label className="sports-field">
                  <span>Cadastrado por</span>
                  <select value={organizerKey} onChange={(e) => setOrganizerKey(e.target.value)}>
                    {organizerContexts.map((ctx) => (
                      <option
                        key={`${ctx.organizerType}:${ctx.organizerId}`}
                        value={`${ctx.organizerType}:${ctx.organizerId}`}
                      >
                        {ctx.name} ({ctx.organizerType})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="sports-form-row sports-form-row-3">
                <label className="sports-field">
                  <span>Em quadra</span>
                  <input
                    type="number"
                    min={1}
                    required
                    value={playersOnField}
                    onChange={(e) => setPlayersOnField(e.target.value)}
                  />
                </label>
                <label className="sports-field">
                  <span>Elenco mínimo</span>
                  <input
                    type="number"
                    min={1}
                    required
                    value={minimumRoster}
                    onChange={(e) => setMinimumRoster(e.target.value)}
                  />
                </label>
                <label className="sports-field">
                  <span>Elenco máximo</span>
                  <input
                    type="number"
                    min={1}
                    required
                    value={maximumRoster}
                    onChange={(e) => setMaximumRoster(e.target.value)}
                  />
                </label>
              </div>

              <div className="sports-form-row sports-form-row-3">
                <label className="sports-field">
                  <span>Pontos vitória</span>
                  <input
                    type="number"
                    min={0}
                    required
                    value={winPoints}
                    onChange={(e) => setWinPoints(e.target.value)}
                  />
                </label>
                <label className="sports-field">
                  <span>Pontos empate</span>
                  <input
                    type="number"
                    min={0}
                    disabled={!allowsDraw}
                    value={allowsDraw ? drawPoints : "0"}
                    onChange={(e) => setDrawPoints(e.target.value)}
                  />
                </label>
                <label className="sports-field">
                  <span>Placar W.O.</span>
                  <input
                    type="number"
                    min={0}
                    required
                    value={forfeitScore}
                    onChange={(e) => setForfeitScore(e.target.value)}
                  />
                </label>
              </div>

              <label className="sports-checkbox">
                <input type="checkbox" checked={allowsDraw} onChange={(e) => setAllowsDraw(e.target.checked)} />
                <span>Modalidade permite empate</span>
              </label>

              <label className="sports-field">
                <span>Regulamento da modalidade</span>
                <textarea
                  rows={4}
                  required
                  placeholder="Descreva as regras gerais, tempo de jogo, substituições…"
                  value={rulesMarkdown}
                  onChange={(e) => setRulesMarkdown(e.target.value)}
                />
              </label>

              <div className="sports-form-actions">
                <button type="button" className="button button-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" className="button button-primary" disabled={busy}>
                  {busy ? "Cadastrando…" : "Cadastrar modalidade"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
