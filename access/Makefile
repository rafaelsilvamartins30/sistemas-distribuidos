.DEFAULT_GOAL := quality

.PHONY: quality test

quality:
	cargo fmt --all -- --check
	cargo clippy --locked --all-targets -- -D warnings
	cargo test --locked

test:
	cargo test --locked
