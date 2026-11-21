.PHONY: quality test

quality:
	CI=true pnpm install --frozen-lockfile
	pnpm --dir .. exec eslint admin-web/src admin-web/test admin-web/vite.config.ts
	pnpm --dir .. exec prettier --check "admin-web/src/**/*.{ts,tsx}" "admin-web/test/**/*.mjs" admin-web/vite.config.ts
	pnpm run build
	pnpm test

test:
	pnpm test
