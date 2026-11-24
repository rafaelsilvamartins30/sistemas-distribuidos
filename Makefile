.DEFAULT_GOAL := quality

CURRENT := web keycloak-theme web-bff
FUTURE := $(shell bash scripts/quality.sh future)
COMPONENTS := $(CURRENT) $(FUTURE)

.PHONY: quality test infra security secrets dependencies ci \
	k8s-demo k8s-clean k8s-reset-demo k8s-reset-clean k8s-down k8s-verify k8s-scale-demo demo-saga \
	docker-demo docker-clean docker-reset-demo docker-reset-clean docker-down docker-demo-saga \
	$(CURRENT) campus payment access ai-rag gateway engagement admin-bff admin-web

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

# --- Kubernetes local (kind) ---
k8s-demo:
	UNIR_SEED_MODE=demo ./scripts/k8s-up.sh

k8s-clean:
	UNIR_SEED_MODE=clean ./scripts/k8s-up.sh

k8s-reset-demo:
	./scripts/k8s-down.sh
	UNIR_SEED_MODE=demo ./scripts/k8s-up.sh

k8s-reset-clean:
	./scripts/k8s-down.sh
	UNIR_SEED_MODE=clean ./scripts/k8s-up.sh

k8s-down:
	./scripts/k8s-down.sh

k8s-verify:
	./scripts/k8s-verify.sh

k8s-scale-demo:
	./scripts/k8s-scale-demo.sh

demo-saga:
	GATEWAY_URL=http://localhost:$${UNIR_K8S_PORT:-18080} KEYCLOAK_URL=http://localhost:$${UNIR_K8S_PORT:-18080} ./scripts/demo-saga-compensation.sh

# --- Docker Compose local (sem Kubernetes) ---
docker-demo:
	UNIR_SEED_MODE=demo ./scripts/compose-up.sh

docker-clean:
	UNIR_SEED_MODE=clean ./scripts/compose-up.sh

docker-reset-demo:
	./scripts/compose-down.sh --volumes
	UNIR_SEED_MODE=demo ./scripts/compose-up.sh

docker-reset-clean:
	./scripts/compose-down.sh --volumes
	UNIR_SEED_MODE=clean ./scripts/compose-up.sh

docker-down:
	./scripts/compose-down.sh

docker-demo-saga:
	GATEWAY_URL=http://localhost:$${GATEWAY_PORT:-18084} KEYCLOAK_URL=http://localhost:$${KEYCLOAK_PORT:-18081} ./scripts/demo-saga-compensation.sh

$(CURRENT) campus payment access ai-rag gateway engagement admin-bff admin-web:
	bash scripts/quality.sh component $@
