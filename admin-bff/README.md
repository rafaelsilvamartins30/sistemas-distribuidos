# Admin BFF

Backend for Frontend (Fastify + TypeScript) dedicado exclusivamente ao painel **Administration** (`admin-web`), protegido pelo API Gateway com exigência do papel global `PLATFORM_ADMIN`.

## Responsabilidades e diferença frente ao Web BFF

Enquanto o `web-bff` compõe jornadas de estudantes e organizadores em múltiplos serviços (`Campus`, `Engagement`, `Payment`, `Access` e `AI-RAG`), o `admin-bff` concentra a governança institucional da universidade em rotas administrativas:

- `GET /api/v1/admin/me` — perfil do administrador autenticado.
- `GET /api/v1/admin/overview` — **agregação dedicada** que reúne em uma única chamada universidade, unidades acadêmicas, departamentos, entidades, comunidades, cursos, semestres, usuários cadastrados e solicitações pendentes.
- `POST /api/v1/admin/academic-units|departments|courses|semesters` — criação de estruturas acadêmicas.
- `PATCH /api/v1/admin/university|academic-units/:id|departments/:id|entities/:id|communities/:id` — edição de perfil institucional e gestão de `administratorUserIds` (permissões contextuais).
- `DELETE /api/v1/admin/academic-units/:id|departments/:id|courses/:id|semesters/:id|entities/:id|communities/:id` — remoção de estruturas.
- `POST /api/v1/admin/requests/:requestId/approve|reject` — decisão sobre solicitações pendentes.

## Qualidade

```sh
pnpm run build && pnpm test
```
