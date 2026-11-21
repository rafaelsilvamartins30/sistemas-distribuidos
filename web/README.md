# Web (`web`)

Cliente web principal da UNIR (React + TypeScript + Vite), acessível em `http://localhost:15173` (Compose) ou `http://localhost:18080` (Kubernetes).

## Fluxos principais

- **Publicações (`/`):** feed institucional da universidade, departamentos, entidades e comunidades, além de descoberta assistida por IA (RAG).
- **Eventos (`/eventos`):** listagem paginada via read model CQRS (MongoDB), criação por organizadores autorizados, inscrição gratuita ou paga (iniciando a Saga), e validação de presença por QR Code.
- **Oportunidades (`/oportunidades`):** bolsas, estágios, iniciação científica e extensão.
- **Esportes (`/esportes`):** catálogo unificado de campeonatos e temporadas com modal centralizado (regras da modalidade, inscrição de equipes e free agents com alocação automática, geração de partidas, placar e check-in).
- **Menu da conta:** **Meus tickets** (`/tickets`), **Meus esportes** (`/meus-esportes`) e **Meus pagamentos** (`/pagamentos`, com confirmação PIX simulada disparando a Saga real pelo RabbitMQ).

## Qualidade

```sh
pnpm run build && pnpm test
```
