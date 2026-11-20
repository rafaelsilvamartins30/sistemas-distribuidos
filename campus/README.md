# Campus

Campus é a API Ruby on Rails responsável pela estrutura da universidade, perfis, vínculos acadêmicos, entidades, comunidades, publicações, notificações e autorização contextual. O PostgreSQL é exclusivo deste serviço.

Campus é a fonte definitiva dos perfis da UNIR. Web e Administration usam os BFFs existentes, que encaminham solicitações para esta API preservando o JWT do Keycloak. O tráfego do navegador passa pelo Gateway e pelos BFFs; Campus não habilita CORS nem publica portas de serviço no host.

## Perfil do usuário

- `POST /users` cria o perfil vinculado ao claim `sub` do JWT.
- `GET /users/me` consulta o perfil pelo `sub` do JWT.
- `PATCH /users/me` atualiza os campos editáveis do próprio perfil.

O contrato preserva `institutionalId`, `affiliationStatus` (`STUDENT`, `PROFESSOR`, `ALUMNI`), `academicLevel` (`UNDERGRADUATE`, `MASTERS`, `DOCTORATE`), `course`, `department` e `interests`. Perfis recebem `courseId` e `departmentId`; Campus verifica que o curso pertence ao departamento. AcademicUnit não é relação do perfil de usuário. O retorno mantém `course` e `department` como nomes de exibição.

Campus verifica assinatura RS256, issuer e validade temporal do JWT; o Gateway valida o papel de acesso à rota. E-mail vem do token e não é armazenado. `PROFESSOR` é autodeclarado no perfil e não concede afiliação nem permissão. A afiliação docente ativa só nasce da aprovação de um administrador do departamento.

## Perfis institucionais e catálogo

`University` é singleton. `AcademicUnit` e `Department` são perfis pares. Um Department administra os cursos com nomes selecionáveis nos perfis. O catálogo de referência que não tem vínculo comprovado com Department permanece fora dos seletores. `administratorUserIds` guarda subjects do Keycloak sem foreign key e é removido das respostas públicas pelo Web BFF.

- `GET /university` e `PATCH /university` consultam e editam a universidade. A inicialização local configura o primeiro administrador da lista.
- `GET, POST /departments`; `GET, PATCH /departments/{id}` listam, criam e editam Departamentos.
- `GET, POST /academic-units`; `GET, PATCH /academic-units/{id}` listam, criam e editam Unidades Acadêmicas.
- University administrators podem criar departamentos e unidades. A pessoa criadora é adicionada aos administradores do novo perfil.
- `GET /courses?departmentId={id}` lista apenas cursos vinculados ao departamento. `POST /courses` e `PATCH /courses/{id}` exigem administrador do Departamento.
- Department, AcademicUnit, University, AcademicEntity e Community compartilham descrição, links de contato, Markdown e administradores. Alterações exigem administrador do perfil.

Veja os relacionamentos, campos e payloads em [`../docs/contracts/campus-academic-catalog.md`](../docs/contracts/campus-academic-catalog.md).

## Entidades, comunidades e solicitações

`GET /entities`, `GET /entities/{id}`, `GET /communities` e `GET /communities/{id}` retornam listas paginadas e detalhes. `PATCH` no perfil exige um administrador listado. Entidades e comunidades são criadas por solicitação; a solicitação pode ser enviada a um Department (`targetDepartmentId`) ou à University (campo ausente/nulo). Administradores do destino podem aprovar ou recusar:

- `POST /requests` envia pedido de `COMMUNITY_CREATION` ou `ENTITY_CREATION`.
- `GET /requests/me` lista os pedidos da pessoa autenticada.
- `GET /requests/pending` lista pedidos dos destinos que ela administra.
- `POST /requests/{id}/approve` e `/reject` fazem revisão, revalidada no Campus.
- `POST /professor-verification-requests` e as rotas de revisão de Department mantêm a solicitação docente existente.

Uma Community pode ser de um Department ou da University. Ao aprovar uma solicitação, Campus cria o perfil e inclui a pessoa solicitante como sua primeira administradora. Os campos `entityType` e `category` permanecem texto livre porque a fonte não define enums.

## Feed, publicações, comunidade e notificações

- `GET,POST /profiles/{profileType}/{profileId}/posts` consulta e publica avisos oficiais. Publicar exige administrador do perfil. O semestre atual vem do singleton University; `availableUntil` esconde o aviso da visualização ativa sem apagar seu histórico de semestre.
- `POST /follows` segue um perfil; `GET /follows` lista somente os próprios follows; `DELETE /follows/{id}` encerra somente um follow próprio.
- `GET /feed` retorna publicações do semestre ativo dos perfis seguidos.
- `POST /polls/{pollId}/votes` aceita um voto por pessoa e poll, até `closesAt`.
- Comunidades têm a central em `/communities/{communityId}/space/posts`. Qualquer seguidor ativo pode publicar, comentar e responder. `GET,POST /community-space-posts/{postId}/comments` lista e escreve comentários. Não há curtidas nem contagem de seguidores.
- `GET /notifications` é a central privada de notificações. `POST /notifications/{id}/read` marca uma como lida e `/notifications/read-all` marca todas as da pessoa autenticada.

Os contratos estão em [`../docs/contracts/campus-social.md`](../docs/contracts/campus-social.md). Solicitações, publicações e notificações permanecem no banco de Campus para manter o histórico; não são apagadas por expiração ou por deixar de seguir.

## Desenvolvimento local

O Compose usa Ruby 3.4.12, PostgreSQL privado `campus-db` (`unir_campus`) e Keycloak para validar tokens. Aplique migrations pendentes com `docker compose exec campus bin/rails db:migrate`.

Para desenvolver no host, instale a versão em `.ruby-version` e execute:

```sh
make quality
make test
```

Desenvolvimento e produção usam PostgreSQL. Os testes automatizados usam SQLite, JWTs assinados e um JWKS simulado.
