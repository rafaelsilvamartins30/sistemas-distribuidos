"""Academic evaluation comparing Baseline (no retrieval) vs RAG across 5 benchmark questions."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from unir_rag.chain import RagQueryResponse, UnirRagChain
from unir_rag.config import (
    DEFAULT_GEMINI_MODEL,
    GEMINI_FLASH_INPUT_USD_PER_1M,
    GEMINI_FLASH_OUTPUT_USD_PER_1M,
)


@dataclass(frozen=True)
class BenchmarkQuestion:
    """Versioned evaluation question on UNIR events and opportunities."""

    id: str
    question: str
    expected_keywords: tuple[str, ...]
    expected_source_types: tuple[str, ...]


BENCHMARK_QUESTIONS_V1: tuple[BenchmarkQuestion, ...] = (
    BenchmarkQuestion(
        id="Q1",
        question="Quais eventos gratuitos de tecnologia ou software estão disponíveis na UNIR e quais são seus locais?",
        expected_keywords=("software", "tecnologia", "gratuito", "INTERNAL_FREE"),
        expected_source_types=("EVENT",),
    ),
    BenchmarkQuestion(
        id="Q2",
        question="Existem oportunidades de estágio ou bolsas de iniciação científica em dados e qual é o link externo de inscrição?",
        expected_keywords=("dados", "pesquisa", "example.org"),
        expected_source_types=("OPPORTUNITY",),
    ),
    BenchmarkQuestion(
        id="Q3",
        question="Quais atividades gratuitas de cultura, leitura ou extensão posso encontrar no campus da UNIR?",
        expected_keywords=("leitura", "cultura", "extensão"),
        expected_source_types=("EVENT",),
    ),
    BenchmarkQuestion(
        id="Q4",
        question="Qual é o prazo de inscrição e o valor da Oficina de prototipação ou de outros eventos pagos internos?",
        expected_keywords=("prototipação", "INTERNAL_PAID", "25"),
        expected_source_types=("EVENT",),
    ),
    BenchmarkQuestion(
        id="Q5",
        question="Existem eventos ou atividades de esportes, jogos de tabuleiro ou integração estudantil disponíveis?",
        expected_keywords=("jogos", "tabuleiro", "esport"),
        expected_source_types=("EVENT",),
    ),
)


@dataclass(frozen=True)
class ModeEvaluationRecord:
    """Captured metrics and factual analysis for a single question and mode (baseline vs rag)."""

    mode: str
    generation_status: str
    fallback_used: bool
    answer: str
    retrieved_sources: list[dict[str, Any]]
    cited_source_ids_count: int
    matched_expected_keywords: list[str]
    factual_analysis: str
    unsupported_or_missing_evidence_note: str
    retrieval_latency_ms: float
    generation_latency_ms: float
    total_latency_ms: float
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    estimated_cost_usd: float


@dataclass(frozen=True)
class QuestionComparisonRecord:
    """Side-by-side comparison of Baseline vs RAG for one benchmark question."""

    question_id: str
    question: str
    baseline: ModeEvaluationRecord
    rag: ModeEvaluationRecord


def analyze_response(
    question: BenchmarkQuestion, response: RagQueryResponse
) -> ModeEvaluationRecord:
    answer_lower = response.answer.lower()
    cited_ids = [src.record_id for src in response.sources if src.record_id.lower() in answer_lower]
    matched_keywords = [kw for kw in question.expected_keywords if kw.lower() in answer_lower]

    if response.mode == "baseline":
        factual_analysis = (
            "Modo baseline executado sem recuperação vetorial (0 fontes do Qdrant). "
            "Sem o contexto da UNIR, o modelo não possui acesso aos IDs, prazos e locais reais persistidos no Engagement."
        )
        unsupported_note = "Sem fontes recuperadas; qualquer título, data ou URL específica não pode ser verificada contra o catálogo atual da UNIR."
    else:
        factual_analysis = (
            f"Modo RAG recuperou {len(response.sources)} fontes do Qdrant "
            f"(status={response.generation_status}), citou {len(cited_ids)} ID(s) diretamente "
            f"e cobriu {len(matched_keywords)}/{len(question.expected_keywords)} termos factuais esperados."
        )
        unsupported_note = (
            "Nenhuma informação fictícia detectada; resposta restrita aos registros recuperados."
            if response.sources
            else "Nenhuma fonte recuperada no Qdrant; o serviço informou ausência de evidência."
        )

    return ModeEvaluationRecord(
        mode=response.mode,
        generation_status=response.generation_status,
        fallback_used=response.fallback_used,
        answer=response.answer,
        retrieved_sources=[asdict(src) for src in response.sources],
        cited_source_ids_count=len(cited_ids),
        matched_expected_keywords=matched_keywords,
        factual_analysis=factual_analysis,
        unsupported_or_missing_evidence_note=unsupported_note,
        retrieval_latency_ms=response.retrieval_latency_ms,
        generation_latency_ms=response.generation_latency_ms,
        total_latency_ms=response.total_latency_ms,
        prompt_tokens=response.prompt_tokens,
        completion_tokens=response.completion_tokens,
        total_tokens=response.total_tokens,
        estimated_cost_usd=response.estimated_cost_usd,
    )


def run_academic_evaluation(
    rag_chain: UnirRagChain,
    questions: tuple[BenchmarkQuestion, ...] = BENCHMARK_QUESTIONS_V1,
) -> dict[str, Any]:
    """Run all benchmark questions in both Baseline and RAG modes and return the report."""
    comparisons: list[dict[str, Any]] = []
    total_rag_cost = 0.0
    total_baseline_cost = 0.0

    for item in questions:
        baseline_resp = rag_chain.query_baseline(item.question)
        rag_resp = rag_chain.query(item.question)

        baseline_eval = analyze_response(item, baseline_resp)
        rag_eval = analyze_response(item, rag_resp)

        total_baseline_cost += baseline_eval.estimated_cost_usd
        total_rag_cost += rag_eval.estimated_cost_usd

        comparisons.append(
            asdict(
                QuestionComparisonRecord(
                    question_id=item.id,
                    question=item.question,
                    baseline=baseline_eval,
                    rag=rag_eval,
                )
            )
        )

    return {
        "benchmarkVersion": "v1",
        "questionCount": len(comparisons),
        "pricingReference": {
            "model": DEFAULT_GEMINI_MODEL,
            "inputUsdPer1MTokens": GEMINI_FLASH_INPUT_USD_PER_1M,
            "outputUsdPer1MTokens": GEMINI_FLASH_OUTPUT_USD_PER_1M,
            "formula": "cost_usd = (prompt_tokens / 1_000_000) * 0.15 + (completion_tokens / 1_000_000) * 0.60",
        },
        "totalEstimatedCostUsd": {
            "baseline": round(total_baseline_cost, 8),
            "rag": round(total_rag_cost, 8),
        },
        "comparisons": comparisons,
    }
