import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type Keycloak from "keycloak-js";
import { useToast } from "../contexts/ToastContext";
import { queryRagAssistant, type RagQueryResponse, type RagSourceTypeFilter } from "../services/rag";
import { extractErrorMessage } from "../utils/apiError.js";

interface RagAssistantWidgetProps {
  keycloak: Keycloak;
}

interface ChatEntry {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  rag?: RagQueryResponse;
}

const SAMPLE_QUESTIONS = [
  "Quais eventos gratuitos acontecem na UFLA?",
  "Quais bolsas ou estágios em Computação estão abertos?",
  "Quais workshops ou palestras de tecnologia estão disponíveis?",
];

function sourceDestination(sourceType: string, recordId: string): string | null {
  if (!recordId) return null;
  if (sourceType.toUpperCase() === "EVENT") return `/eventos/${recordId}`;
  if (sourceType.toUpperCase() === "OPPORTUNITY") return `/oportunidades/${recordId}`;
  return null;
}

function sourceTypeLabel(sourceType: string): string {
  const normalized = sourceType.toUpperCase();
  if (normalized === "EVENT") return "Evento";
  if (normalized === "OPPORTUNITY") return "Oportunidade";
  return normalized;
}

export function RagAssistantWidget({ keycloak }: RagAssistantWidgetProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [sourceFilter, setSourceFilter] = useState<RagSourceTypeFilter | null>(null);
  const [useLiveTool, setUseLiveTool] = useState(true);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open, busy]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function sendQuestion(rawText: string) {
    const trimmed = rawText.trim();
    if (trimmed.length < 3 || busy) return;

    const userEntry: ChatEntry = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmed,
    };
    setMessages((prev) => [...prev, userEntry]);
    setQuestion("");
    setBusy(true);

    try {
      await keycloak.updateToken(30);
      if (!keycloak.token) throw new Error("Sessão expirada. Faça login novamente.");

      const response = await queryRagAssistant(keycloak.token, {
        question: trimmed,
        top_k: 5,
        source_type: sourceFilter,
        use_live_tool: useLiveTool,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: response.answer,
          rag: response,
        },
      ]);
    } catch (err) {
      const errorText = extractErrorMessage(err, "Não foi possível consultar o Assistente RAG.");
      toast.error(errorText);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "error",
          text: errorText,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendQuestion(question);
  }

  return (
    <>
      <button
        type="button"
        className="rag-fab"
        onClick={() => setOpen(true)}
        aria-label="Abrir Assistente UNIR com IA (RAG)"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
          <path d="M19 3v4M17 5h4M5 17v4M3 19h4" strokeLinecap="round" />
        </svg>
        <span>Assistente UNIR</span>
      </button>

      {open && (
        <div
          className="rag-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rag-assistant-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="rag-modal-card">
            <header className="rag-modal-header">
              <div>
                <p className="rag-kicker">IA &amp; Busca Vetorial · Gemini + Qdrant</p>
                <h2 id="rag-assistant-title">Assistente UNIR (RAG)</h2>
              </div>
              <div className="rag-header-actions">
                {messages.length > 0 && (
                  <button
                    type="button"
                    className="button button-secondary rag-clear-btn"
                    onClick={() => setMessages([])}
                    disabled={busy}
                  >
                    Limpar
                  </button>
                )}
                <button
                  type="button"
                  className="rag-close-btn"
                  onClick={() => setOpen(false)}
                  aria-label="Fechar Assistente UNIR"
                >
                  ×
                </button>
              </div>
            </header>

            <div className="rag-controls-bar">
              <div className="rag-filter-pills" role="group" aria-label="Filtrar base de conhecimento">
                <button
                  type="button"
                  className={`rag-chip ${sourceFilter === null ? "is-active" : ""}`}
                  onClick={() => setSourceFilter(null)}
                >
                  Tudo
                </button>
                <button
                  type="button"
                  className={`rag-chip ${sourceFilter === "EVENT" ? "is-active" : ""}`}
                  onClick={() => setSourceFilter("EVENT")}
                >
                  Eventos
                </button>
                <button
                  type="button"
                  className={`rag-chip ${sourceFilter === "OPPORTUNITY" ? "is-active" : ""}`}
                  onClick={() => setSourceFilter("OPPORTUNITY")}
                >
                  Oportunidades
                </button>
              </div>

              <label className="rag-live-toggle">
                <input type="checkbox" checked={useLiveTool} onChange={(e) => setUseLiveTool(e.target.checked)} />
                <span>Consultar eventos ao vivo</span>
              </label>
            </div>

            <div className="rag-messages" ref={listRef}>
              {messages.length === 0 ? (
                <div className="rag-empty-state">
                  <p className="rag-empty-lead">
                    Pergunte sobre eventos, bolsas, estágios ou workshops cadastrados na UNIR. As respostas citam os
                    registros reais recuperados da base vetorial.
                  </p>
                  <div className="rag-suggestions">
                    {SAMPLE_QUESTIONS.map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        className="rag-suggestion-btn"
                        disabled={busy}
                        onClick={() => void sendQuestion(sample)}
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((entry) => {
                  if (entry.role === "user") {
                    return (
                      <div key={entry.id} className="rag-bubble rag-bubble-user">
                        {entry.text}
                      </div>
                    );
                  }
                  if (entry.role === "error") {
                    return (
                      <div key={entry.id} className="rag-bubble rag-bubble-error">
                        <strong>Erro na consulta:</strong> {entry.text}
                      </div>
                    );
                  }

                  const rag = entry.rag;
                  return (
                    <article key={entry.id} className="rag-bubble rag-bubble-assistant">
                      {rag && (
                        <div className="rag-status-row">
                          <span className={`rag-status-pill ${rag.fallback_used ? "is-fallback" : "is-generated"}`}>
                            {rag.fallback_used ? "Fallback (Somente Busca)" : `Gerado · ${rag.model_name}`}
                          </span>
                          {rag.live_tool_results.length > 0 && (
                            <span className="rag-status-pill is-live">
                              +{rag.live_tool_results.length} evento(s) ao vivo
                            </span>
                          )}
                        </div>
                      )}

                      <div className="rag-answer-text">{entry.text}</div>

                      {rag && rag.sources.length > 0 && (
                        <div className="rag-sources">
                          <p className="rag-sources-label">Fontes recuperadas ({rag.sources.length})</p>
                          <div className="rag-sources-list">
                            {rag.sources.map((src) => {
                              const dest = sourceDestination(src.source_type, src.record_id);
                              const label = `${sourceTypeLabel(src.source_type)} · ${src.title}`;
                              return dest ? (
                                <Link
                                  key={`${src.source_type}-${src.record_id}`}
                                  to={dest}
                                  className="rag-source-link"
                                  onClick={() => setOpen(false)}
                                >
                                  <span>{label}</span>
                                  <small>{Math.round(src.score * 100)}%</small>
                                </Link>
                              ) : (
                                <span key={`${src.source_type}-${src.record_id}`} className="rag-source-link">
                                  <span>{label}</span>
                                  <small>{Math.round(src.score * 100)}%</small>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {rag && (
                        <footer className="rag-telemetry">
                          <span>Total: {Math.round(rag.total_latency_ms)} ms</span>
                          <span>Busca: {Math.round(rag.retrieval_latency_ms)} ms</span>
                          <span>LLM: {Math.round(rag.generation_latency_ms)} ms</span>
                          <span>Tokens: {rag.total_tokens}</span>
                          <span>Custo est.: US$ {rag.estimated_cost_usd.toFixed(6)}</span>
                        </footer>
                      )}
                    </article>
                  );
                })
              )}

              {busy && (
                <div className="rag-bubble rag-bubble-loading" role="status">
                  Consultando base vetorial (Qdrant) e gerando resposta no Gemini…
                </div>
              )}
            </div>

            <form className="rag-input-form" onSubmit={handleSubmit}>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Pergunte sobre eventos ou oportunidades da UFLA…"
                minLength={3}
                maxLength={600}
                disabled={busy}
                aria-label="Sua pergunta para o Assistente UNIR"
              />
              <button type="submit" className="button button-primary" disabled={busy || question.trim().length < 3}>
                {busy ? "Consultando…" : "Enviar"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
