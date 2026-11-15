# Engagement

Serviço de domínio responsável por atividades/eventos, inscrições e processos seletivos de oportunidades da UNIR. Stack: Java 21, Spring Boot, Maven, PostgreSQL e Flyway.

## Endpoints

- `GET /health` verifica a conectividade com o banco PostgreSQL próprio (`unir_engagement`) e retorna `200`.
- Demais rotas exigem JWT válido do Keycloak e permanecem negadas (`denyAll`) até a definição dos contratos de eventos e oportunidades.

## Ambiente local

No `compose.yaml`, `engagement` expõe a porta `18085` (`ENGAGEMENT_PORT`) e conecta ao banco `engagement-db` (`unir_engagement`, porta `15434`).

## Qualidade

Na pasta `engagement`: `make quality` (`mvn --batch-mode verify`) ou `make test` (`mvn --batch-mode test`), ou pela raiz com `make engagement`.
