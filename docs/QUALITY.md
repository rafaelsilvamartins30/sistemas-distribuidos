# Qualidade e Pipeline de Verificação — UNIR

A plataforma possui uma pipeline unificada de qualidade, infraestrutura e segurança executável tanto localmente (via `Makefile` / `scripts/quality.sh`) quanto no GitHub Actions.

---

## 1. Como rodar a pipeline

```sh
# Pipeline completa (qualidade de todos os serviços + infraestrutura + segurança)
make ci

# Apenas qualidade de todos os serviços (lint, formatação, análise estática, testes e build)
make quality

# Apenas um serviço específico
make web
make web-bff
make admin-web
make admin-bff
make keycloak-theme
make gateway
make engagement
make campus
make payment
make access
make ai-rag

# Apenas suítes de teste (todas ou de um componente)
make test
make test COMPONENT=engagement

# Apenas infraestrutura (ESLint/Prettier de tooling, limites TS, actionlint, Hadolint e kubeconform)
make infra

# Apenas segurança (Gitleaks no histórico Git + OSV-Scanner nas dependências)
make security
```

> Use `make -k ci` se quiser continuar executando os demais checks mesmo após uma falha isolada.

---

## 2. O que a pipeline verifica em cada sistema

| Alvo / Componente | Ferramentas executadas | O que pega |
| --- | --- | --- |
| **`web`** | ESLint, Prettier, `tsc`, `node --test`, `vite build` | Erros de lint/React hooks, formatação, tipagem TypeScript, testes unitários de serviços/componentes e empacotamento de produção. |
| **`web-bff`** | ESLint, Prettier, `tsc`, `node --test` | Lint, formatação, tipagem e testes das rotas de composição/proxy do BFF Web. |
| **`admin-web`** | ESLint, Prettier, `tsc`, `node --test`, `vite build` | Lint, formatação, tipagem, testes e build do painel administrativo. |
| **`admin-bff`** | ESLint, Prettier, `tsc`, `node --test` | Lint, formatação, tipagem e testes de agregação/encaminhamento administrativo. |
| **`keycloak-theme`** | ESLint, Prettier, `keycloakify` (`build-keycloak-theme`) | Lint, formatação e empacotamento do JAR do tema UNIR para Keycloak. |
| **`gateway`** | Maven `verify`: Spotless, Checkstyle, JUnit/MockMvc, ArchUnit, PMD, SpotBugs | Formatação Java, estilo, testes de roteamento/JWT/CORS/RBAC, regras arquiteturais e análise estática de bugs. |
| **`engagement`** | Maven `verify`: Spotless, Checkstyle, JUnit/SpringBootTest (H2), ArchUnit, PMD, SpotBugs | Formatação, estilo, testes de domínio (eventos, oportunidades, esportes, Outbox, Saga/compensação, projeção CQRS), limites de camadas e análise estática. |
| **`campus`** | RuboCop (`rubocop-rails`), Brakeman, `rails zeitwerk:check`, `rails test` | Estilo/métricas Ruby, vulnerabilidades de segurança Rails, autoloading e suíte completa de modelos/controllers/seeders. |
| **`payment`** | `gofmt`, `go vet`, `golangci-lint`, `go test`, `go build` | Formatação Go, bugs estáticos, lint, testes de Event Store/projeção/Outbox/estorno e compilação. |
| **`access`** | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test --locked` | Formatação Rust, warnings/idiomas Clippy e testes de tickets, QR hash, presença e consumidores RabbitMQ. |
| **`ai-rag`** | `uv sync`, `ruff check`, `ruff format --check`, `pytest` | Lint e formatação Python, validação JWT/auth, ingestão idempotente no Qdrant, timeout/retry/fallback degradado do Gemini e avaliação acadêmica. |

---

## 3. Verificações de infraestrutura e segurança

### `make infra`
- **ESLint e Prettier de tooling:** valida scripts e configurações TypeScript/JS da raiz;
- **Checagem arquitetural TypeScript (`scripts/check-ts-architecture.mjs`):** bloqueia imports cruzados entre pacotes/componentes e proíbe clientes de banco de dados nos BFFs;
- **`actionlint`:** valida sintaxe e expressões dos workflows em `.github/workflows/`;
- **`hadolint`:** verifica boas práticas e segurança em todos os `Dockerfile` do repositório;
- **`kubeconform -strict -summary`:** valida todos os manifests YAML em `infra/k8s/` contra os schemas oficiais do Kubernetes sem precisar de cluster ativo.

### `make security`
- **`gitleaks`:** varre o histórico Git procurando credenciais/chaves acidentalmente versionadas (com baseline explícito em `scripts/gitleaks-baseline.json`);
- **`osv-scanner`:** consulta vulnerabilidades conhecidas (CVEs) em todos os lockfiles (`pnpm-lock.yaml`, `Gemfile.lock`, `go.mod`, `Cargo.lock`, `uv.lock`) e em SBOMs CycloneDX gerados automaticamente a partir dos `pom.xml` do `gateway` e `engagement`.

---

## 4. Ferramentas locais necessárias (para rodar `make ci` no host)

- **Runtimes:** Java 21 + Maven 3.9, Node 22 + pnpm 11.25.0, Ruby 3.4.12 + Bundler, Go 1.27, Rust (`rust-toolchain.toml`), Python 3.12 + `uv`.
- **CLIs de infra/segurança:** `actionlint`, `gitleaks`, `hadolint`, `osv-scanner` e `kubeconform` (no Linux x86-64 e macOS ARM64, `bash scripts/install-quality-tools.sh "$HOME/.local/bin" all` instala `hadolint`, `osv-scanner` e `kubeconform`).
- Para apenas **executar a aplicação** via `make k8s-demo` ou `make k8s-clean`, nenhum desses runtimes precisa estar instalado no host — tudo roda em containers no Kubernetes.
