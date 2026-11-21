# UNIR — University Network for Integration and Relationships

Plataforma universitária distribuída construída para a disciplina **GCC129 — Sistemas Distribuídos (UFLA)** em regime diferencial (desenvolvimento individual, sem módulo de blockchain conforme registrado no RD Form).

## 1. Problema, Motivação e Impacto Social

A comunicação institucional e a participação estudantil nas universidades públicas brasileiras sofrem com **fragmentação de canais** (e-mails dispersos, murais físicos, grupos informais de mensageria e sistemas legados isolados). Como consequência, estudantes perdem prazos de bolsas, iniciação científica, eventos acadêmicos e atividades esportivas, agravando o desengajamento e a evasão nos primeiros períodos:

1. **Censo da Educação Superior (INEP/MEC, 2023):** aponta taxas acumuladas de desistência superiores a 50% em cursos de graduação presenciais no Brasil, correlacionadas à baixa integração acadêmica e social no campus.
2. **Tinto, V. (1993, *Leaving College*):** demonstra que a integração acadêmica e social do estudante com departamentos, entidades estudantis e atividades extracurriculares é um dos principais fatores de permanência universitária.
3. **Pascarella, E. T., & Terenzini, P. T. (2005, *How College Affects Students*):** evidencia que o envolvimento em atividades extracurriculares, pesquisa e esporte universitário eleva o desempenho acadêmico e o senso de pertencimento.
4. **Fórum Nacional de Pró-Reitores de Assuntos Estudantis — FONAPRACE / ANDIFES (V Pesquisa Nacional de Perfil Socioeconômico e Cultural, 2019):** destaca a assimetria de acesso à informação sobre auxílios, bolsas e oportunidades acadêmicas entre estudantes ingressantes e veteranos.
5. **UNESCO (2022, *Reimagining Our Futures Together*):** reforça o papel de infraestruturas digitais abertas e inclusivas para democratizar o acesso a oportunidades educacionais e comunitárias.

**Impacto social esperado:** centralizar a vida universitária em um ecossistema único — conectando universidade, unidades acadêmicas, departamentos, entidades estudantis, comunidades, eventos, oportunidades, esportes e descoberta assistida por IA (RAG). O impacto pode ser mensurado por: (i) taxa de participação em eventos e oportunidades por estudante, (ii) tempo médio para descoberta de editais via busca semântica/RAG e (iii) redução de ausência (*no-show*) com check-in digital via QR Code.

## 2. Arquitetura e Serviços

- **4 microsserviços de domínio independentes (poliglota + Database per Service):**
  - **Campus** (Ruby on Rails + PostgreSQL `unir_campus`) — estrutura institucional (universidade, unidades acadêmicas, departamentos, cursos, entidades, comunidades), perfis, feed social, notificações, solicitações e autorização contextual.
  - **Engagement** (Java 21 / Spring Boot + PostgreSQL `unir_engagement` + MongoDB `unir_engagement_read` para **CQRS** + Outbox) — eventos (com **HATEOAS `_links`**), inscrições, oportunidades e módulo completo de esportes (campeonatos, temporadas, equipes, free agents, partidas e presença).
  - **Payment** (Go 1.27 + PostgreSQL `unir_payment` com **Event Sourcing + Outbox**) — ciclo de vida de cobranças PIX simuladas, confirmação e reembolsos compensatórios da **Saga coreografada**.
  - **Access** (Rust / Axum + PostgreSQL `unir_access`) — credenciais de acesso, tickets QR, validação de presença e revogação automática na compensação da Saga.
- **Serviço de IA/RAG (`ai-rag`):** Python / FastAPI + LangChain + Qdrant + FastEmbed local + Gemini remoto (com tool de consulta ao vivo, timeout/retry e fallback).
- **2 BFFs distintos + API Gateway:** `web-bff` (para `web`) e `admin-bff` (agregação administrativa exclusiva para `admin-web`), protegidos pelo **Gateway** (Spring Cloud Gateway MVC) com validação JWT/OIDC via **Keycloak**.

Documentação completa:
- [Relatório Técnico Completo (GCC129)](docs/relatorio-tecnico-gcc129.md)
- [Especificação OpenAPI 3.0](docs/api/openapi.yaml)
- [Contratos de API e Mensageria](docs/contracts/)
- [Guia de Kubernetes Local](infra/k8s/README.md)
- [Guia de Qualidade](docs/QUALITY.md)

## 3. Como Subir do Zero (Docker Compose)

Pré-requisitos: Docker com Docker Compose v2, Python 3 (para provisionamento das contas locais).

```sh
# 1. Copie o arquivo de variáveis locais (opcional: preencha GEMINI_API_KEY para geração LLM real no RAG)
cp config/local.env.example .env

# 2. Recrie os volumes locais, suba todos os serviços, migre bancos e popule dados e contas demo
make local-reset
```

URLs no Docker Compose:
- **Web:** http://localhost:15173
- **Administration:** http://localhost:15175
- **Gateway:** http://localhost:18084
- **Keycloak:** http://localhost:18081 · **Mailpit:** http://localhost:18025

As credenciais geradas para o administrador principal (`unir.admin`) e demais contas locais são salvas em `config/local-demo-accounts.json` (ignorado pelo Git).

## 4. Como Subir no Kubernetes Local (`kind`)

```sh
# Cria o cluster kind, constrói/carrega imagens, aplica ConfigMaps, Secrets, Deployments, Services e Ingress
./scripts/k8s-up.sh

# Verifica saúde, autenticação OIDC, CQRS e fluxos principais
./scripts/k8s-verify.sh

# Demonstra escalabilidade real (3 réplicas + distribuição de carga)
./scripts/k8s-scale-demo.sh

# Demonstra ao vivo a Saga paga (caminho feliz + compensação por cancelamento) + CQRS + HATEOAS
./scripts/demo-saga-compensation.sh
```

URLs no Kubernetes (`kind` via Traefik Ingress):
- **Web + Gateway + Keycloak:** http://localhost:18080
- **Administration:** http://admin.localhost:18080

## 5. Verificações de Qualidade

Execute `make ci` na raiz para rodar os checks dos serviços (Spotless, Checkstyle, PMD, SpotBugs, ArchUnit, `go test`, `cargo test`, Ruff/Pytest, ESLint/Prettier e testes Node/TypeScript).
