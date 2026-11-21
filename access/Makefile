.DEFAULT_GOAL := quality

.PHONY: quality test integration

quality:
	cargo fmt --all -- --check
	cargo clippy --locked --all-targets -- -D warnings
	cargo test --locked

test:
	cargo test --locked

integration:
	test -n "$$ACCESS_TEST_DATABASE_URL" || (echo "Set ACCESS_TEST_DATABASE_URL to an isolated PostgreSQL database" && exit 2)
	cargo test --locked --test attendance_postgres -- --ignored --test-threads=1
