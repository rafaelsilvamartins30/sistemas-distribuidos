# Tema UNIR para Keycloak

O login, cadastro, verificação de email e recuperação de acesso usam Keycloakify, com identidade visual em `src/login/main.css`. A tela de Account usa o Account v3 nativo do Keycloak, estendido em `account-theme/account` para aplicar a marca e as cores UNIR sem substituir o fluxo de conta.

## Usar com a infraestrutura local

Na raiz do repositório:

```sh
docker compose up --build -d
```

As credenciais locais ficam no `.env` da raiz; em um clone novo, use `config/local.env.example` como modelo.

Acesse http://localhost:18081/realms/unir/account ou inicie a autorização OIDC conforme o [README da raiz](../README.md). O `accountTheme` e o `loginTheme` são definidos em `config/keycloak/unir-realm.json` para instalações novas. Como o importador não sobrescreve um realm existente, `config/keycloak/apply-user-profile.sh` também aplica a configuração ao realm local existente.

## Desenvolvimento

Requer Node 22+, pnpm 11, JDK e Maven. Em `keycloak-theme/`:

```sh
pnpm install --frozen-lockfile
pnpm build-keycloak-theme
```

O JAR gerado fica em `dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar`. Para aplicar mudanças no Compose, rode `docker compose up --build -d keycloak` na raiz.
