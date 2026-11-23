# Admin BFF (`admin-bff`)

Backend for Frontend dedicado exclusivamente ao painel **UNIR Administration (`admin-web`)**, acessível apenas para tokens com papel global `PLATFORM_ADMIN` validado no `gateway`.

- **Stack:** Node.js 22 + Fastify + TypeScript (`pnpm`).
- **Acesso:** interno no Kubernetes (`ClusterIP` `admin-bff:3000`), sem porta pública no host.

---

## Como funciona e singularidades

1. **Isolamento de superfície administrativa:** separa completamente as operações de governança global da universidade do tráfego do `web-bff`, mantendo o mesmo princípio de não possuir banco de dados próprio e sempre repassar o JWT do administrador ao `Campus`.
2. **Agregação dedicada (`GET /api/v1/admin/overview`):** reduz múltiplas chamadas paralelas do painel em um único payload consolidado contendo universidade, unidades acadêmicas, departamentos, cursos, semestres, entidades, comunidades, usuários cadastrados e solicitações pendentes.

---

## Rotas expostas (via Gateway · `PLATFORM_ADMIN`)

- `GET /health`
- `GET /api/v1/admin/me` — perfil do administrador autenticado
- `GET /api/v1/admin/overview` — agregação completa de governança institucional
- `POST /api/v1/admin/academic-units|departments|courses|semesters` — criação de estruturas acadêmicas
- `PATCH /api/v1/admin/university|academic-units/:id|departments/:id|entities/:id|communities/:id` — edição de perfis institucionais e `administratorUserIds`
- `DELETE /api/v1/admin/academic-units/:id|departments/:id|courses/:id|semesters/:id|entities/:id|communities/:id` — remoção de estruturas
- `POST /api/v1/admin/requests/:requestId/approve|reject` — decisão sobre solicitações pendentes
- **Contratos:** [Catálogo Acadêmico](../docs/contracts/campus-academic-catalog.md) · [Semestres](../docs/contracts/campus-semesters.md)

---

## Qualidade

```sh
make admin-bff
```
