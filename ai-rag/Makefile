.DEFAULT_GOAL := quality

export PATH := $(HOME)/.local/bin:/opt/homebrew/bin:/usr/local/bin:$(PATH)

.PHONY: dependencies quality test lint format typecheck

dependencies:
	@if ! command -v uv >/dev/null 2>&1; then \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
	fi
	uv sync --extra dev

lint: dependencies
	uv run ruff check src tests
	uv run ruff format --check src tests

typecheck: dependencies
	uv run mypy src

format: dependencies
	uv run ruff format src tests

test: dependencies
	uv run pytest -v

quality: lint typecheck test
