# Admin BFF (`admin-bff`)

Backend for Frontend dedicado exclusivamente ao painel **UNIR Administration (`admin-web`)**, acessível apenas para tokens com papel global `PLATFORM_ADMIN` validado no `gateway`.

- **Stack:** Node.js 22 + Fastify + TypeScript (`pnpm`).
- **Acesso:** interno no Kubernetes (`ClusterIP` `admin-bff:3000`), sem porta pública no host.

---

## Como funciona e singularidades

1. **Isolamento de superfície administrativa:** mantém edição da universidade, catálogo de semestres e gestão esportiva fora do `web-bff`. O Admin BFF não tem banco próprio e repassa o JWT ao serviço responsável (`Campus` ou `Engagement`).
2. **Agregações dedicadas:** `/api/v1/admin/overview` reúne dados acadêmicos e solicitações; `/api/v1/admin/sports/catalog` reúne modalidades, contextos, campeonatos e temporadas.

---

## Rotas expostas (via Gateway · `PLATFORM_ADMIN`)

- `GET /health`
- `GET /api/v1/admin/me` — perfil do administrador autenticado
- `GET /api/v1/admin/overview` — agregação completa de governança institucional
- `GET /api/v1/admin/sports/catalog` — catálogo e contextos esportivos
- `POST /api/v1/admin/academic-units|departments|courses|semesters` — criação de estruturas acadêmicas
- `PATCH /api/v1/admin/university|semesters/:id|academic-units/:id|departments/:id|entities/:id|communities/:id` — edição institucional; a universidade não aceita administradores contextuais
- `POST /api/v1/admin/sports|competitions|seasons` and `/api/v1/admin/sports-events/**`, `/api/v1/admin/sports-matches/**` — gestão de modalidades, campeonatos e partidas
- `DELETE /api/v1/admin/academic-units/:id|departments/:id|courses/:id|entities/:id|communities/:id` — remoção de estruturas
- `POST /api/v1/admin/requests/:requestId/approve|reject` — decisão sobre solicitações pendentes
- **Contratos:** [Catálogo Acadêmico](../docs/contracts/campus-academic-catalog.md) · [Semestres](../docs/contracts/campus-semesters.md)

---

## Qualidade

```sh
make admin-bff
```
