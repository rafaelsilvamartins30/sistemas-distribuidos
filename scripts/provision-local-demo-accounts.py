#!/usr/bin/env python3
"""Idempotently provision the managed local demo accounts in the unir realm."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from shlex import quote

ROOT = Path(__file__).resolve().parents[1]
ACCOUNTS = ROOT / "config" / "local-demo-accounts.json"


def compose_project() -> str:
    result = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout).get("name", "")


def provision_script(account_data: dict) -> str:
    lines = [
        "set -eu",
        "KCADM=/opt/keycloak/bin/kcadm.sh",
        "CONFIG=$(mktemp)",
        "trap 'rm -f \"$CONFIG\"' EXIT",
        '"$KCADM" config credentials --config "$CONFIG" --server http://localhost:8080 --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null',
    ]
    for username, account in account_data.items():
        alias = quote(username)
        email = quote(account["email"])
        # The existing realm has registrationEmailAsUsername enabled. Keep that
        # authentication contract and use the local alias only in our manifest.
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
                f"  \"$KCADM\" create users -r unir --config \"$CONFIG\" -s username={user} -s email={email} -s emailVerified=true -s enabled=true >/dev/null",
                f"  found=$(\"$KCADM\" get users -r unir -q username={user} -q exact=true --config \"$CONFIG\")",
                "fi",
                f"printf '%s\\n' \"$found\" | grep -F {username_json_pretty} >/dev/null || printf '%s\\n' \"$found\" | grep -F {username_json_compact} >/dev/null || {{ echo 'Login por e-mail do realm inconsistente; interrupção segura.' >&2; exit 1; }}",
                f"printf '%s\\n' \"$found\" | grep -F {email_json_pretty} >/dev/null || printf '%s\\n' \"$found\" | grep -F {email_json_compact} >/dev/null || {{ echo 'E-mail local não confere; interrupção segura.' >&2; exit 1; }}",
                "sub=$(printf '%s\\n' \"$found\" | sed -n 's/.*\\\"id\\\" *: *\\\"\\([^\\\"]*\\)\\\".*/\\1/p' | head -n 1)",
                "[ -n \"$sub\" ] || { echo 'Keycloak não retornou ID para a conta local.' >&2; exit 1; }",
                f"\"$KCADM\" update users/$sub -r unir --config \"$CONFIG\" -s username={user} -s email={email} -s emailVerified=true -s enabled=true >/dev/null",
                f"\"$KCADM\" set-password -r unir --config \"$CONFIG\" --username {user} --new-password {password} >/dev/null",
                f"\"$KCADM\" add-roles -r unir --config \"$CONFIG\" --uusername {user} --rolename USER >/dev/null",
                f"printf '%s\\t%s\\n' {alias} \"$sub\"",
            ]
        )
        if "PLATFORM_ADMIN" in account["roles"]:
            lines.append(f"\"$KCADM\" add-roles -r unir --config \"$CONFIG\" --uusername {user} --rolename PLATFORM_ADMIN >/dev/null")
        else:
            lines.append(f"\"$KCADM\" remove-roles -r unir --config \"$CONFIG\" --uusername {user} --rolename PLATFORM_ADMIN >/dev/null")
    lines.append("echo 'Contas locais do realm unir provisionadas.'")
    return "\n".join(lines) + "\n"


def main() -> None:
    if not ACCOUNTS.is_file():
        raise SystemExit("Arquivo ausente; execute scripts/prepare-local-demo-accounts.py primeiro.")
    if compose_project() != "unir":
        raise SystemExit("O projeto Compose não é 'unir'; nenhuma conta foi provisionada.")
    data = json.loads(ACCOUNTS.read_text(encoding="utf-8"))
    if data.get("realm") != "unir" or len(data.get("accounts", {})) != 8:
        raise SystemExit("O arquivo de contas não corresponde ao conjunto local esperado.")
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "keycloak", "sh", "-s"],
        cwd=ROOT,
        input=provision_script(data["accounts"]),
        check=True,
        text=True,
        capture_output=True,
    )
    assigned_ids = dict(line.split("\t", 1) for line in result.stdout.splitlines() if "\t" in line)
    if set(assigned_ids) != set(data["accounts"]):
        raise SystemExit("Keycloak não confirmou o ID das 8 contas; arquivo local não foi alterado.")
    for username, keycloak_id in assigned_ids.items():
        data["accounts"][username]["sub"] = keycloak_id
    write_private_json(data)
    print("Keycloak: 8 contas locais provisionadas; segredos não foram exibidos.")


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


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        raise SystemExit(f"Provisionamento local falhou (código {error.returncode}). Nenhum segredo foi exibido.") from error
