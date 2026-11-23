# Tema UNIR para Keycloak (`keycloak-theme`)

Identidade visual customizada da UNIR aplicada às telas de autenticação e conta do **Keycloak**, empacotada dentro da imagem `unir-keycloak:local` utilizada no Kubernetes.

- **Stack:** Keycloakify + React + Vite + Maven (empacotamento JAR).

---

## Como funciona

- As telas de login, cadastro, verificação de e-mail e recuperação de acesso usam **Keycloakify** (`src/login/main.css`).
- A tela de gerenciamento de conta estende o tema nativo **Account v3** (`account-theme/account`) aplicando cores e marca UNIR sem substituir o fluxo padrão do Keycloak.
- O `Dockerfile` compila o JAR (`dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar`) e o copia para `/opt/keycloak/providers/` na imagem `unir-keycloak:local`.
- O realm `unir` (`config/keycloak/unir-realm.json` + `config/keycloak/apply-user-profile.sh`) ativa `loginTheme` e `accountTheme` automaticamente durante o bootstrap `scripts/k8s-up.sh`.

---

## Qualidade

```sh
make keycloak-theme   # ESLint, Prettier e build do JAR com Keycloakify
```
