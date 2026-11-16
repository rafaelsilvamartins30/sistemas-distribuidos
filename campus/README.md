# Campus

Campus é a API Ruby on Rails responsável pela estrutura da universidade, perfis, vínculos acadêmicos, entidades, comunidades e autorização contextual. O PostgreSQL é exclusivo deste serviço.

Campus é a fonte definitiva dos perfis da UNIR. Web e Administration usam os BFFs existentes, que encaminham as solicitações para esta API preservando o JWT do Keycloak. Os dados do ambiente anterior não são importados.

## Endpoints

- `GET /health/live` informa se o processo está em execução.
- `GET /health/ready` executa `SELECT 1` no banco do Campus e retorna `503` quando ele está indisponível.
- `POST /users` cria o perfil vinculado ao claim `sub` do JWT.
- `GET /users/me` consulta o perfil pelo `sub` do JWT.
- `PATCH /users/me` atualiza somente os campos editáveis do próprio perfil.

As rotas de perfil exigem um bearer JWT assinado pelo Keycloak. Campus verifica assinatura RS256, issuer e validade temporal; o Gateway aplica os papéis exigidos por cada rota. O e-mail e a confirmação de e-mail retornados por GET/PATCH vêm do JWT e não são armazenados. A criação retorna 201 sem esses claims; GET/PATCH retornam 404 até a criação, e duplicidade de `sub` ou matrícula retorna 409. Payloads inválidos retornam 400 e JWT ausente/inválido retorna 401.

O serviço e seu banco não publicam portas no host, e o Campus não habilita CORS. O tráfego do navegador passa pelo Gateway e pelos BFFs até Campus.

## Compatibilidade do perfil

O contrato HTTP preserva os nomes e enums públicos existentes: `institutionalId`, `affiliationStatus` (`STUDENT`, `PROFESSOR`, `ALUMNI`), `academicLevel` (`UNDERGRADUATE`, `MASTERS`, `DOCTORATE`), `course`, `department` e `interests`. O `id` retornado é o `sub`; o UUID interno do registro é separado, e `keycloak_user_id` tem unicidade no banco.

O armazenamento segue o vocabulário de Campus onde a conversão é direta: `institutionalId` é persistido como `registration_code`; os níveis são guardados como `UNDERGRAD`, `MASTER` e `PHD`, mantendo a tradução de ida e volta para o contrato HTTP. `legacy_affiliation_status` preserva os estados públicos que ainda não possuem equivalente interno. `STUDENT` e `PROFESSOR` também preenchem `user_type`; `ALUMNI` permanece sem conversão para `STAFF` até uma decisão de domínio. O campo `department` do perfil permanece texto e não é convertido nesta leva. `email` vem do JWT e bio/avatar não fazem parte do contrato atual.

## Universidade e departamentos

Campus persiste o singleton `University` e os registros `Department`, seguindo a página **Campus — Classes** do tldraw. Como University é singleton e Department não possui `universityId` no modelo aprovado, a associação é implícita: todos os departamentos pertencem à universidade do Campus. `administratorUserIds` guarda referências ao Keycloak sem foreign key para perfis.

Consultas internas exigem Bearer JWT do Keycloak:

- `GET /university` retorna o registro singleton; retorna `404` até ele existir.
- `GET /departments?page=0&size=20&sort=name` lista departamentos em páginas; `sort` aceita `name`, `acronym` e prefixo `-` para ordem decrescente.
- `GET /departments/{id}` retorna o departamento ou `404`.

As listas usam `items`, `page`, `size`, `totalElements` e `totalPages`, conforme as convenções REST. O endpoint interno inclui `administratorUserIds`; o Web BFF remove esse campo da resposta ao navegador. As consultas são somente leitura. O seed local cria uma universidade UFRJ e dois departamentos, usando IDs estáveis e sem substituir registros com esses IDs.

## Entidades acadêmicas e comunidades

`AcademicEntity` e `Community` seguem os campos da página **Campus — Classes** do tldraw. Ambos possuem `id`, `name`, `description`, `generalInfoMarkdown`, `logoUrl`, `bannerUrl`, `links` e `managerUserIds`; `AcademicEntity` também possui `entityType` e `departmentId` opcional, enquanto `Community` possui `category` opcional. `entityType` e `category` são armazenados como texto: os documentos consultados não definem enums para esses campos. A associação opcional de entidade a departamento é uma foreign key local; IDs de gestores continuam sendo referências ao Keycloak sem foreign key.

- `GET /entities?page=0&size=20&sort=name` lista entidades; `sort` aceita `name`, `entityType` e prefixo `-` para ordem decrescente.
- `GET /entities/{id}` retorna uma entidade ou `404`.
- `GET /communities?page=0&size=20&sort=name` lista comunidades; `sort` aceita `name`, `category` e prefixo `-` para ordem decrescente.
- `GET /communities/{id}` retorna uma comunidade ou `404`.

As listas usam o mesmo contrato paginado de Department. O Campus retorna `managerUserIds` internamente; o Web BFF remove os IDs de gestores das respostas públicas. Estas rotas são somente leitura nesta leva. O seed adiciona registros locais explicitamente marcados como demonstração, com IDs estáveis, apenas quando esses IDs ainda não existem.

```sh
docker compose exec campus bin/rails db:seed
```

## Desenvolvimento local

O Compose usa Ruby 3.4.12, o PostgreSQL privado `campus-db` (`unir_campus`) e o Keycloak para validar tokens. O banco possui o volume nomeado exclusivo `campus_data` e não é compartilhado com outros domínios. Após iniciar os serviços, aplique migrations pendentes com `docker compose exec campus bin/rails db:migrate`.

Para desenvolver no host, instale a versão indicada em `.ruby-version` e execute:

```sh
make quality
make test
```

Desenvolvimento e produção usam PostgreSQL. Os testes automatizados usam um arquivo SQLite privado, JWTs de teste assinados e um JWKS simulado; a validação adicional em Compose usa o PostgreSQL local real.
