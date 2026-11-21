#!/usr/bin/env python3
"""Create the ignored local credential file for the eight UNIR demo accounts."""

from __future__ import annotations

import json
import os
import secrets
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "config" / "local-demo-accounts.json"
NAMESPACE = uuid.UUID("6bc5849c-694a-4cef-8839-6b9ef7ad5cf4")

PROFILES = {
    "unir.admin": {
        "scenario": "Administrador principal da universidade e administrador contextual do DCC",
        "roles": ["USER", "PLATFORM_ADMIN"],
        "name": "Administrador Principal UNIR",
        "registrationCode": "LOCAL-UFLA-0001",
        "affiliationStatus": "STUDENT",
        "academicLevel": "UNDERGRAD",
        "courseName": "Sistemas de Informação",
        "departmentUnitCode": "ICET",
        "departmentCode": "DCC",
    },
    "unir.departamento": {
        "scenario": "Professor autodeclarado e gestor contextual do DCC; pode revisar pedidos",
        "roles": ["USER"],
        "name": "Gestor de Departamento de Demonstração",
        "registrationCode": "LOCAL-UFLA-0002",
        "affiliationStatus": "PROFESSOR",
        "academicLevel": "PHD",
        "courseName": "Ciência da Computação",
        "departmentUnitCode": "ICET",
        "departmentCode": "DCC",
    },
    "unir.entidade": {
        "scenario": "Estudante gestor de entidade acadêmica local fictícia",
        "roles": ["USER"],
        "name": "Gestor de Entidade de Demonstração",
        "registrationCode": "LOCAL-UFLA-0003",
        "affiliationStatus": "STUDENT",
        "academicLevel": "UNDERGRAD",
        "courseName": "Sistemas de Informação",
        "departmentUnitCode": "ICET",
        "departmentCode": "DCC",
    },
    "unir.professor.aprovado": {
        "scenario": "Professor com pedido aprovado e afiliação ACTIVE",
        "roles": ["USER"],
        "name": "Professor Aprovado de Demonstração",
        "registrationCode": "LOCAL-UFLA-0004",
        "affiliationStatus": "PROFESSOR",
        "academicLevel": "PHD",
        "courseName": "Ciência da Computação",
        "departmentUnitCode": "ICET",
        "departmentCode": "DCC",
    },
    "unir.professor.novo": {
        "scenario": "Professor com solicitação pendente de verificação pelo DCC",
        "roles": ["USER"],
        "name": "Professor Pendente de Demonstração",
        "registrationCode": "LOCAL-UFLA-0005",
        "affiliationStatus": "PROFESSOR",
        "academicLevel": "PHD",
        "courseName": "Ciência da Computação",
        "departmentUnitCode": "ICET",
        "departmentCode": "DCC",
    },
    "unir.aluno1": {
        "scenario": "Estudante de Sistemas de Informação no ICET",
        "roles": ["USER"],
        "name": "Estudante 1 de Demonstração",
        "registrationCode": "LOCAL-UFLA-0006",
        "affiliationStatus": "STUDENT",
        "academicLevel": "UNDERGRAD",
        "courseName": "Sistemas de Informação",
        "departmentUnitCode": "ICET",
        "departmentCode": "DCC",
    },
    "unir.aluno2": {
        "scenario": "Estudante de outro curso na ESAL",
        "roles": ["USER"],
        "name": "Estudante 2 de Demonstração",
        "registrationCode": "LOCAL-UFLA-0007",
        "affiliationStatus": "STUDENT",
        "academicLevel": "UNDERGRAD",
        "courseName": "Agronomia",
        "departmentUnitCode": "ESAL",
        "departmentCode": "DAG",
    },
    "unir.aluno3": {
        "scenario": "Estudante de outra unidade acadêmica, FCS",
        "roles": ["USER"],
        "name": "Estudante 3 de Demonstração",
        "registrationCode": "LOCAL-UFLA-0008",
        "affiliationStatus": "STUDENT",
        "academicLevel": "UNDERGRAD",
        "courseName": "Medicina",
        "departmentUnitCode": "FCS",
        "departmentCode": "DME",
    },
}


def stable_id(kind: str, username: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{kind}/{username}"))


def write_private_json(payload: dict) -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".local-demo-accounts-", dir=OUTPUT.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, OUTPUT)
        os.chmod(OUTPUT, 0o600)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def main() -> None:
    previous = {}
    if OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8")).get("accounts", {})
        except (json.JSONDecodeError, OSError) as error:
            raise SystemExit(f"Não foi possível ler {OUTPUT}; preserve o arquivo e corrija o JSON antes de continuar.") from error

    accounts = {}
    for username, profile in PROFILES.items():
        old = previous.get(username, {})
        profile_id = stable_id("campus-profile", username)
        if old and old.get("profileId") != profile_id:
            raise SystemExit(f"ID de perfil divergente no arquivo local para {username}; não foi alterado.")
        accounts[username] = {
            "username": username,
            "login": f"{username.replace('.', '-')}@unir-demo.test",
            "email": f"{username.replace('.', '-')}@unir-demo.test",
            "password": old.get("password") or secrets.token_urlsafe(36),
            "sub": old.get("sub", ""),
            "profileId": profile_id,
            "scenario": profile["scenario"],
            "roles": profile["roles"],
            "profile": {
                "name": profile["name"],
                "registrationCode": profile["registrationCode"],
                "affiliationStatus": profile["affiliationStatus"],
                "academicLevel": profile["academicLevel"],
                "courseName": profile["courseName"],
                "departmentUnitCode": profile["departmentUnitCode"],
                "departmentCode": profile["departmentCode"],
                "interests": ["Demonstração local"],
            },
        }

    write_private_json({"version": 1, "realm": "unir", "accounts": accounts})
    print(f"Arquivo local criado/atualizado com 8 contas: {OUTPUT}")
    print("As senhas foram preservadas neste arquivo com permissão 0600 e não foram exibidas.")


if __name__ == "__main__":
    main()
