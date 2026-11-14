#!/bin/sh
set -eu

KCADM_CONFIG=/tmp/kcadm.config

/opt/keycloak/bin/kcadm.sh config credentials \
    --config "$KCADM_CONFIG" \
    --server http://keycloak:8080 \
    --realm master \
    --user "$KEYCLOAK_ADMIN_USERNAME" \
    --password "$KEYCLOAK_ADMIN_PASSWORD"

/opt/keycloak/bin/kcadm.sh update users/profile \
    --config "$KCADM_CONFIG" \
    -r unir \
    -n \
    -f /config/user-profile.json

/opt/keycloak/bin/kcadm.sh update realms/unir \
    --config "$KCADM_CONFIG" \
    -s accountTheme=unir-account

/opt/keycloak/bin/kcadm.sh update authentication/required-actions/UPDATE_EMAIL \
    --config "$KCADM_CONFIG" \
    -r unir \
    -s enabled=true \
    -s defaultAction=false

if [ "${RECOVERY_CODES_ENABLED:-false}" = "true" ]; then
    /opt/keycloak/bin/kcadm.sh update authentication/required-actions/CONFIGURE_RECOVERY_AUTHN_CODES \
        --config "$KCADM_CONFIG" \
        -r unir \
        -s enabled=true \
        -s defaultAction=false

    RECOVERY_EXECUTION=$(
        /opt/keycloak/bin/kcadm.sh get authentication/flows/browser/executions \
            --config "$KCADM_CONFIG" \
            -r unir \
            --fields id,providerId,requirement \
            --format csv \
            --noquotes |
            while IFS=, read -r EXECUTION_ID PROVIDER_ID REQUIREMENT; do
                if [ "$PROVIDER_ID" = "auth-recovery-authn-code-form" ]; then
                    printf '%s,%s\n' "$EXECUTION_ID" "$REQUIREMENT"
                    break
                fi
            done
    )

    if [ -z "$RECOVERY_EXECUTION" ]; then
        echo "Keycloak recovery-code execution was not found in the browser flow." >&2
        exit 1
    fi

    RECOVERY_EXECUTION_ID=${RECOVERY_EXECUTION%%,*}
    RECOVERY_EXECUTION_REQUIREMENT=${RECOVERY_EXECUTION#*,}

    if [ "$RECOVERY_EXECUTION_REQUIREMENT" != "ALTERNATIVE" ]; then
        RECOVERY_EXECUTION_CONFIG=$(mktemp)
        trap 'rm -f "$RECOVERY_EXECUTION_CONFIG"' EXIT
        printf '{"id":"%s","requirement":"ALTERNATIVE"}\n' \
            "$RECOVERY_EXECUTION_ID" > "$RECOVERY_EXECUTION_CONFIG"

        /opt/keycloak/bin/kcadm.sh update authentication/flows/browser/executions \
            --config "$KCADM_CONFIG" \
            -r unir \
            -f "$RECOVERY_EXECUTION_CONFIG"
    fi
fi

CLIENT_ID=$(
    /opt/keycloak/bin/kcadm.sh get clients \
        --config "$KCADM_CONFIG" \
        -r unir \
        -q clientId=unir-web \
        --fields id \
        --format csv \
        --noquotes |
        head -n 1
)

if [ -z "$CLIENT_ID" ]; then
    echo "Keycloak client unir-web was not found in realm unir." >&2
    exit 1
fi

WEB_ORIGIN="http://localhost:${WEB_PORT:-15173}"

/opt/keycloak/bin/kcadm.sh update "clients/$CLIENT_ID" \
    --config "$KCADM_CONFIG" \
    -r unir \
    -s "redirectUris=[\"$WEB_ORIGIN/*\"]" \
    -s "webOrigins=[\"$WEB_ORIGIN\"]"

PROFILE_SCOPE_ID=$(
    /opt/keycloak/bin/kcadm.sh get "clients/$CLIENT_ID/default-client-scopes" \
        --config "$KCADM_CONFIG" \
        -r unir \
        --fields id,name \
        --format csv \
        --noquotes |
        while IFS=, read -r SCOPE_ID SCOPE_NAME; do
            if [ "$SCOPE_NAME" = "profile" ]; then
                printf '%s\n' "$SCOPE_ID"
                break
            fi
        done
)

if [ -n "$PROFILE_SCOPE_ID" ]; then
    /opt/keycloak/bin/kcadm.sh delete \
        "clients/$CLIENT_ID/default-client-scopes/$PROFILE_SCOPE_ID" \
        --config "$KCADM_CONFIG" \
        -r unir
fi
