.PHONY: quality test

quality:
	CI=true pnpm install --frozen-lockfile
	pnpm --dir .. exec eslint admin-bff/src admin-bff/test
	pnpm --dir .. exec prettier --check "admin-bff/src/**/*.ts" "admin-bff/test/**/*.mjs"
	pnpm test

test:
	pnpm test
