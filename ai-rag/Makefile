.DEFAULT_GOAL := quality

export PATH := $(HOME)/.local/bin:/opt/homebrew/bin:/usr/local/bin:$(PATH)

.PHONY: dependencies quality test lint format

dependencies:
	@if ! command -v uv >/dev/null 2>&1; then \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
	fi
	uv sync --extra dev

lint: dependencies
	uv run ruff check src tests
	uv run ruff format --check src tests

format: dependencies
	uv run ruff format src tests

test: dependencies
	uv run pytest -v

quality: lint test
