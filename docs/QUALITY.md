# Qualidade da UNIR

## Ambiente local

Use Java 21, Maven 3.9, Node 22 atualizado, pnpm 11.25.0, Bash, GNU Make, Git e Docker Compose v2. A validação do Compose usa a CLI e o arquivo de exemplo, sem depender do daemon Docker.

```sh
CI=true pnpm install --frozen-lockfile
CI=true pnpm --dir web install --frozen-lockfile
CI=true pnpm --dir keycloak-theme install --frozen-lockfile
CI=true pnpm --dir web-bff install --frozen-lockfile
```

Disponibilize no PATH actionlint 1.7.12, Gitleaks 8.30.1, Hadolint 2.14.0, OSV-Scanner 2.3.8 e, quando houver manifests, kubeconform 0.7.0. No Linux x86-64 e macOS ARM64, `bash scripts/install-quality-tools.sh "$HOME/.local/bin" all` instala Hadolint, OSV-Scanner e kubeconform após conferir os hashes dos binários oficiais. Os outros dois têm instruções de instalação nas páginas de releases do [actionlint](https://github.com/rhysd/actionlint/releases/tag/v1.7.12) e [Gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1).

## Comandos da raiz

| Comando | Verificação |
| --- | --- |
| `make user-service` | `mvn verify` com Spotless, Checkstyle, PMD, SpotBugs, JUnit, ArchUnit e empacotamento. |
| `make web`, `make keycloak-theme`, `make web-bff` | ESLint, Prettier e compilação. Web empacota a aplicação, Keycloak gera o tema e o BFF executa os testes após compilar. |
| `make quality` | Qualidade de todos os componentes presentes. |
| `make test` / `make test COMPONENT=web-bff` | Suítes existentes, todas ou de um componente. A Web e o tema têm build, mas ainda não têm suíte própria. |
| `make infra` | Lint e formato das ferramentas, limites TypeScript, Compose, actionlint, Hadolint e validação dos manifests Kubernetes presentes. |
| `make security` | Gitleaks sobre o histórico Git e OSV-Scanner sobre os inventários de dependências. |
| `make ci` | Os mesmos checks dos jobs de PR. Use `make -k ci` para continuar os checks independentes após uma falha. |

O OSV consulta advisories para lockfiles e para SBOMs temporários gerados pelo Maven com CycloneDX. A consulta precisa de rede e falha quando há advisories. A varredura cobre dependências de código, sem testar se uma vulnerabilidade é alcançável nem auditar as imagens publicadas. Para o Gitleaks, use um clone com o histórico completo.

Hadolint verifica os arquivos versionados ou locais não ignorados chamados `Dockerfile*` ou `*.Dockerfile`. Guarde manifests Kubernetes renderizados em `infra/k8s/`. O kubeconform roda em modo estrito quando encontra YAML nessa árvore. Ao definir a versão do cluster ou introduzir CRDs, configure a versão de schema e as fontes de schema correspondentes no comando de infraestrutura. A validação usa esquemas e dispensa um cluster.

Os checks arquiteturais Java protegem os limites entre controllers, persistência e entidades. O check TypeScript bloqueia imports relativos entre componentes conhecidos e clientes de banco reconhecidos nos BFFs. Essas regras não demonstram compatibilidade de contratos HTTP nem substituem testes de integração. O Prettier cobre fontes JS/TS dos componentes atuais. CSS e fontes geradas do tema ficam fora desse escopo.

## Adicionar um componente

A CI descobre os projetos pelos arquivos da tabela. Cada projeto detectado recebe seu próprio job e precisa disponibilizar um `Makefile` com alvos `quality` e `test`. O alvo `quality` deve executar instalação reproduzível quando necessária, lint, análise, testes e compilação ou empacotamento aplicáveis. O alvo `test` deve executar uma suíte real. Fixe as versões de toolchain e dependências nos arquivos nativos do projeto. Se o runtime fixado exigir provisionamento adicional no runner, configure-o no mesmo PR que introduz o serviço. A presença do arquivo sem os alvos exigidos falha.

| Diretório e arquivo de ativação | Comandos a ligar ao Makefile do projeto |
| --- | --- |
| `campus/Gemfile` | Bundler com lockfile, `bundle exec rubocop`, `bundle exec brakeman --no-pager`, `bin/rails test` com banco de teste isolado. |
| `payment/go.mod` | Falhar se `gofmt -l .` listar arquivos, `go vet ./...`, `golangci-lint run` com versão fixada, `go test ./...` e `go build ./...`. Evite repetir o analisador vet na configuração do golangci-lint. |
| `access/Cargo.toml` | Fixe toolchain, rustfmt e Clippy em `rust-toolchain.toml`. Use `cargo fmt --all -- --check`, `cargo clippy --locked --all-targets -- -D warnings` e `cargo test --locked`. |
| `ai-rag/pyproject.toml` | Instale a partir do lockfile e execute `ruff check .`, `ruff format --check .` e `python -m pytest`. Testes devem usar fixtures locais e mocks para APIs externas. |
| `gateway/pom.xml`, `engagement/pom.xml` | Siga os plugins e a organização de testes do User Service. Use `mvn --batch-mode verify` e `mvn --batch-mode test`. Escreva regras ArchUnit para os limites reais do serviço. |
| `admin-bff/package.json`, `admin-web/package.json` | Instalação frozen com pnpm. Reuse o ESLint e o Prettier da raiz sobre os fontes do projeto. Execute o build com TypeScript e a suíte do componente. Use `src/` para incluir os fontes na checagem de arquitetura existente. |

Uma matriz vazia mantém o job de componentes adicionais desativado. Os serviços existentes continuam com jobs independentes.
