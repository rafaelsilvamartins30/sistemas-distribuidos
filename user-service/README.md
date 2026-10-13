# User Service

Armazena os dados da UNIR. Keycloak cuida de registro, email, senha, verificação de email, login, sessões, tokens e logout. Stack: Java 21, Spring Boot, Maven, PostgreSQL e Flyway.

## Ambiente local

Na raiz do repositório:

```sh
docker compose up --build -d
```

Esse comando sobe todos os componentes atuais. As credenciais locais ficam no `.env` da raiz, ignorado pelo Git; `config/local.env.example` é o modelo para um clone novo. URLs e configuração atual:

- Keycloak/admin: http://localhost:18081 — usuário e senha em `.env`. O login, cadastro e recuperação de acesso usam o tema UNIR em `keycloak-theme/`.
- Realm: `unir`; client público: `unir-web`. As roles globais `USER` e `PLATFORM_ADMIN` são do Keycloak; novos registros recebem `USER`.
- Authorization Code com PKCE S256; sem client secret e sem Direct Access Grants. Client scopes padrão: `basic` (inclui `sub`), `profile`, `email` e `roles`.
- Redirects do futuro cliente web: `http://localhost:15173/*`; web origin: `http://localhost:15173`.
- Mailpit: http://localhost:18025. O realm envia emails para `mailpit:1025`, sem TLS/autenticação.
- User Service: http://localhost:18082 (configurável por `USER_SERVICE_PORT` em `.env`).
- PostgreSQL do User Service: `localhost:15433`, banco `unir_users`, usuário `unir`. Keycloak usa outra instância PostgreSQL no Compose.

O Keycloak usa `start-dev` e banco de desenvolvimento em volume local. O Compose compila o tema Keycloakify e o instala como JAR na imagem local. O realm em `config/keycloak/unir-realm.json` é importado automaticamente na primeira inicialização; um realm existente não é sobrescrito. Se você já tinha o realm com as portas anteriores, ajuste os redirects e o web origin no Admin Console ou recrie somente o volume descartável do banco do Keycloak. O banco do User Service tem outro volume.

A API fica em `http://localhost:18082` com a porta padrão do Compose. O issuer deve corresponder exatamente ao do token; use `localhost:18081` também no navegador. Spring Security usa as chaves do Keycloak e valida assinatura, issuer e validade temporal.

As migrations V1 e V2 preservam o histórico já aplicado. V3 troca os IDs para texto e remove o email do banco do User Service. Registros antigos mantêm o texto do UUID anterior e precisam de associação explícita com o `sub` correspondente; não há associação automática por email. Confira os registros existentes antes de usar esses perfis com identidades do Keycloak.

## Testar registro, verificação e login

Sem frontend, use o navegador e um terminal com `curl`, `openssl` e `python3`:

1. No terminal, gere PKCE e a URL de autorização:

```sh
CODE_VERIFIER=$(openssl rand -hex 32)
CODE_CHALLENGE=$(printf '%s' "$CODE_VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
STATE=$(openssl rand -hex 16)
printf '%s\n' "http://localhost:18081/realms/unir/protocol/openid-connect/auth?client_id=unir-web&redirect_uri=http%3A%2F%2Flocalhost%3A15173%2F&response_type=code&scope=openid%20profile%20email&state=$STATE&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256"
```

2. Abra a URL e escolha **Register**. Informe nome, sobrenome e email; confirme o endereço pelo email em http://localhost:18025. Siga as etapas do Keycloak para definir a senha e concluir o login.
3. O navegador será redirecionado para `http://localhost:15173/`. Sem frontend, a página não abre; copie a URL completa da barra de endereço, que contém `code` e `state`.
4. No mesmo terminal, cole a URL abaixo e troque o código pelos tokens emitidos pelo Keycloak:

```sh
REDIRECT_URL='cole-a-url-completa-aqui'
CODE=$(python3 -c 'import sys, urllib.parse; q = urllib.parse.parse_qs(urllib.parse.urlparse(sys.argv[1]).query); assert q["state"][0] == sys.argv[2], "state inválido"; print(q["code"][0])' "$REDIRECT_URL" "$STATE")
TOKEN_RESPONSE=$(curl --fail-with-body -sS http://localhost:18081/realms/unir/protocol/openid-connect/token \
  --data-urlencode grant_type=authorization_code \
  --data-urlencode client_id=unir-web \
  --data-urlencode redirect_uri=http://localhost:15173/ \
  --data-urlencode code="$CODE" \
  --data-urlencode code_verifier="$CODE_VERIFIER")
ACCESS_TOKEN=$(printf '%s' "$TOKEN_RESPONSE" | python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])')
```

O código é de uso único e expira rapidamente. Se necessário, gere outra URL e repita o login. O refresh token também é emitido e gerenciado pelo Keycloak.

5. Crie o User da UNIR e consulte seus dados:

```sh
curl -i http://localhost:18082/users \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana Silva","institutionalId":"12345","course":"Computação","department":"Tecnologia","interests":[]}'
curl -i http://localhost:18082/users/me -H "Authorization: Bearer $ACCESS_TOKEN"
curl -i -X PATCH http://localhost:18082/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana Martins","course":"Matemática","department":"DCC","interests":["football"]}'
```

`POST /users` retorna 201; o ID vem do claim `sub` e o nome vem do request. `GET /users/me` inclui `email` e `emailVerified` lidos apenas do JWT. `PATCH /users/me` aceita apenas os campos enviados entre nome, curso, departamento e interesses; uma lista vazia limpa os interesses. Campos de identidade ou matrícula no request retornam 400. GET/PATCH retornam 404 antes da criação do perfil. Todos retornam 401 sem token válido. Criação repetida do mesmo `sub` ou matrícula retorna 409. As roles do claim `realm_access.roles` ficam disponíveis como authorities `ROLE_USER` e `ROLE_PLATFORM_ADMIN`, sem regras de autorização adicionais por enquanto. O Account Console fica em http://localhost:18081/realms/unir/account e permite gerenciar a autenticação.

## Qualidade

Na pasta `user-service`: `mvn test`, `mvn spotless:apply`, `mvn spotless:check`, `mvn checkstyle:check` ou `mvn verify` para todos os checks e build. Os testes usam H2, JWT mockado do Spring Security e nenhuma instância real do Keycloak.
