"""Regression test for the Gemini timeout returning without waiting for its worker."""

from __future__ import annotations

import sys
import time
from types import SimpleNamespace

import pytest

from unir_rag.chain import GeminiLangChainGenerator, TransientLlmError


def test_gemini_timeout_does_not_wait_for_executor_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class SlowChain:
        def invoke(self, payload: object) -> SimpleNamespace:
            _ = payload
            time.sleep(0.3)
            return SimpleNamespace(content="late response", usage_metadata={})

    class Prompt:
        def __or__(self, llm: object) -> SlowChain:
            _ = llm
            return SlowChain()

    class PromptTemplate:
        @staticmethod
        def from_messages(messages: object) -> Prompt:
            _ = messages
            return Prompt()

    monkeypatch.setattr("unir_rag.chain.ChatPromptTemplate", PromptTemplate)
    monkeypatch.setitem(
        sys.modules,
        "langchain_google_genai",
        SimpleNamespace(ChatGoogleGenerativeAI=lambda **kwargs: SimpleNamespace(**kwargs)),
    )

    started = time.monotonic()
    with pytest.raises(TransientLlmError, match="exceeded timeout"):
        GeminiLangChainGenerator(api_key="test").generate("system", "question", 0.02)
    assert time.monotonic() - started < 0.15
