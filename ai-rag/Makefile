.DEFAULT_GOAL := quality

UV ?= $(shell PATH="$$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$$PATH" command -v uv 2>/dev/null || echo uv)

.PHONY: dependencies quality test lint format

dependencies:
	PATH="$$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$$PATH" $(UV) sync --extra dev

lint: dependencies
	PATH="$$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$$PATH" $(UV) run ruff check src tests
	PATH="$$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$$PATH" $(UV) run ruff format --check src tests

format: dependencies
	PATH="$$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$$PATH" $(UV) run ruff format src tests

test: dependencies
	PATH="$$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$$PATH" $(UV) run pytest -v

quality: lint test
