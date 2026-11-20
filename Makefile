.DEFAULT_GOAL := quality

CURRENT := web keycloak-theme web-bff
FUTURE := $(shell bash scripts/quality.sh future)
COMPONENTS := $(CURRENT) $(FUTURE)

.PHONY: quality test infra security secrets dependencies ci local-demo $(CURRENT) campus payment access ai-rag gateway engagement admin-bff admin-web

quality: $(COMPONENTS)

test:
	bash scripts/quality.sh test $(if $(COMPONENT),$(COMPONENT),$(COMPONENTS))

infra:
	bash scripts/quality.sh infra

security: secrets dependencies

secrets:
	bash scripts/quality.sh secrets

dependencies:
	bash scripts/quality.sh dependencies

ci: quality infra security

local-demo:
	./scripts/seed-local-demo.sh

$(CURRENT) campus payment access ai-rag gateway engagement admin-bff admin-web:
	bash scripts/quality.sh component $@
