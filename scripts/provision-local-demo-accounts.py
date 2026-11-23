#!/usr/bin/env python3
"""Helper module used by scripts/k8s-up.sh to provision UNIR accounts in Keycloak."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from shlex import quote

ROOT = Path(__file__).resolve().parents[1]
ACCOUNTS = ROOT / "config" / "local-demo-accounts.json"


def provision_script(account_data: dict, rag_client_id: str, rag_client_secret: str) -> str:
    lines = [
        "set -eu",
        "KCADM=/opt/keycloak/bin/kcadm.sh",
        "CONFIG=$(mktemp)",
        "trap 'rm -f \"$CONFIG\"' EXIT",
        '"$KCADM" config credentials --config "$CONFIG" --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null',
        f"RAG_SYNC_CLIENT_ID={quote(rag_client_id)}",
        f"RAG_SYNC_CLIENT_SECRET={quote(rag_client_secret)}",
    ]
    for username, account in account_data.items():
        alias = quote(username)
        email = quote(account["email"])
        full_name = str(account.get("profile", {}).get("name") or username).strip()
        name_parts = full_name.split(None, 1)
        first_name = quote(name_parts[0])
        last_name = quote(name_parts[1] if len(name_parts) > 1 else "UNIR")
        user = email
        password = quote(account["password"])
        username_json_pretty = quote(f'"username" : "{account["email"]}"')
        username_json_compact = quote(f'"username":"{account["email"]}"')
        email_json_pretty = quote(f'"email" : "{account["email"]}"')
        email_json_compact = quote(f'"email":"{account["email"]}"')
        lines.extend(
            [
                f"found=$(\"$KCADM\" get users -r unir -q username={user} -q exact=true --config \"$CONFIG\")",
                "found_compact=$(printf '%s' \"$found\" | tr -d '[:space:]')",
                "if [ -z \"$found_compact\" ] || [ \"$found_compact\" = '[]' ]; then",
                f"  \"$KCADM\" create users -r unir --config \"$CONFIG\" -s username={user} -s email={email} -s firstName={first_name} -s lastName={last_name} -s emailVerified=true -s enabled=true >/dev/null",
                f"  found=$(\"$KCADM\" get users -r unir -q username={user} -q exact=true --config \"$CONFIG\")",
                "fi",
                f"printf '%s\\n' \"$found\" | grep -F {username_json_pretty} >/dev/null || printf '%s\\n' \"$found\" | grep -F {username_json_compact} >/dev/null || {{ echo 'Login por e-mail do realm inconsistente; interrupção segura.' >&2; exit 1; }}",
                f"printf '%s\\n' \"$found\" | grep -F {email_json_pretty} >/dev/null || printf '%s\\n' \"$found\" | grep -F {email_json_compact} >/dev/null || {{ echo 'E-mail local não confere; interrupção segura.' >&2; exit 1; }}",
                "sub=$(printf '%s\\n' \"$found\" | sed -n 's/.*\\\"id\\\" *: *\\\"\\([^\\\"]*\\)\\\".*/\\1/p' | head -n 1)",
                "[ -n \"$sub\" ] || { echo 'Keycloak não retornou ID para a conta local.' >&2; exit 1; }",
                f"\"$KCADM\" update users/$sub -r unir --config \"$CONFIG\" -s username={user} -s email={email} -s firstName={first_name} -s lastName={last_name} -s emailVerified=true -s enabled=true >/dev/null",
                f"\"$KCADM\" set-password -r unir --config \"$CONFIG\" --username {user} --new-password {password} >/dev/null",
                f"\"$KCADM\" add-roles -r unir --config \"$CONFIG\" --uusername {user} --rolename USER >/dev/null",
                f"printf '%s\\t%s\\n' {alias} \"$sub\"",
            ]
        )
        if "PLATFORM_ADMIN" in account["roles"]:
            lines.append(
                f"\"$KCADM\" add-roles -r unir --config \"$CONFIG\" --uusername {user} --rolename PLATFORM_ADMIN >/dev/null"
            )
        else:
            lines.append(
                f"\"$KCADM\" remove-roles -r unir --config \"$CONFIG\" --uusername {user} --rolename PLATFORM_ADMIN >/dev/null"
            )
    lines.extend(
        [
            'client_id=$("$KCADM" get clients -r unir -q "clientId=$RAG_SYNC_CLIENT_ID" --fields id --format csv --noquotes --config "$CONFIG" | head -n 1)',
            'if [ -z "$client_id" ]; then',
            '  "$KCADM" create clients -r unir --config "$CONFIG" -s "clientId=$RAG_SYNC_CLIENT_ID" -s enabled=true -s protocol=openid-connect -s publicClient=false -s serviceAccountsEnabled=true -s standardFlowEnabled=false -s directAccessGrantsEnabled=false -s "secret=$RAG_SYNC_CLIENT_SECRET"',
            '  client_id=$("$KCADM" get clients -r unir -q "clientId=$RAG_SYNC_CLIENT_ID" --fields id --format csv --noquotes --config "$CONFIG" | head -n 1)',
            'else',
            '  "$KCADM" update "clients/$client_id" -r unir --config "$CONFIG" -s enabled=true -s publicClient=false -s serviceAccountsEnabled=true -s standardFlowEnabled=false -s directAccessGrantsEnabled=false -s "secret=$RAG_SYNC_CLIENT_SECRET"',
            'fi',
            '"$KCADM" add-roles -r unir --config "$CONFIG" --uusername "service-account-$RAG_SYNC_CLIENT_ID" --rolename USER >/dev/null',
            "echo 'Contas locais e client de leitura do AI/RAG provisionados no realm unir.'",
        ]
    )
    return "\n".join(lines) + "\n"


def write_private_json(payload: dict) -> None:
    descriptor, temporary_name = tempfile.mkstemp(prefix=".local-demo-accounts-", dir=ACCOUNTS.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, ACCOUNTS)
        os.chmod(ACCOUNTS, 0o600)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)
