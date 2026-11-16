.DEFAULT_GOAL := quality

.PHONY: dependencies quality test

dependencies:
	@if ! bundle check >/dev/null 2>&1; then bundle install --jobs 4 --retry 3; fi

quality: dependencies
	bundle exec rubocop
	bundle exec brakeman --no-pager
	bin/rails zeitwerk:check
	RAILS_ENV=test bin/rails db:prepare
	bin/rails test

test: dependencies
	RAILS_ENV=test bin/rails db:prepare
	bin/rails test
