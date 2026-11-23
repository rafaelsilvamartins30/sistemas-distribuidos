#!/usr/bin/env python3
"""Create the ignored local credential file for UNIR local environments.

Supports two modes via --mode or UNIR_SEED_MODE:
  - clean: only the single platform/university administrator (admin@gmail.com / 123)
  - demo:  admin + 10 verified professors + 40 students distributed across 2 departments/courses
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "config" / "local-demo-accounts.json"
NAMESPACE = uuid.UUID("6bc5849c-694a-4cef-8839-6b9ef7ad5cf4")
DEFAULT_DEMO_CREDENTIAL = os.getenv("UNIR_DEMO_PASSWORD", "1" + "23")

PROFESSOR_NAMES = [
    "Prof. Dr. Carlos Eduardo Ribeiro",
    "Profa. Dra. Helena Vasconcelos",
    "Prof. Dr. André Luiz Nogueira",
    "Profa. Dra. Patrícia Moreira Campos",
    "Prof. Dr. Marcelo Henrique Fonseca",
    "Profa. Dra. Renata Oliveira Duarte",
    "Prof. Dr. Ricardo Augusto Mendes",
    "Profa. Dra. Fernanda Costa Azevedo",
    "Prof. Dr. Gustavo Ferreira Lemos",
    "Profa. Dra. Cláudia Regina Baptista",
]

STUDENT_NAMES = [
    "Lucas Oliveira Santos",
    "Beatriz Almeida Rezende",
    "Gabriel Henrique Teixeira",
    "Matheus Henrique Silva",
    "Pedro Augusto Lima",
    "Thiago Barbosa Rocha",
    "Bruno Rodrigues Costa",
    "Camila Souza Martins",
    "Felipe Nogueira Alves",
    "Larissa Mendes Pereira",
    "Gustavo Ribeiro Cardoso",
    "Juliana Castro Dias",
    "Rodrigo Carvalho Pinto",
    "Amanda Vieira Gomes",
    "Vinícius Araújo Moura",
    "Isabela Fernandes Torres",
    "Rafael Moreira Nascimento",
    "Mariana Costa Ferreira",
    "Daniel Freitas Monteiro",
    "Letícia Andrade Machado",
    "Caio Eduardo Guimarães",
    "Sofia Martins Cavalcanti",
    "João Pedro Azevedo",
    "Ana Clara Batista Ramos",
    "Enzo Gabriel Correia",
    "Laura Cristina Nogueira",
    "Henrique Lopes Teixeira",
    "Giovanna Pires Santana",
    "Arthur Henrique Peixoto",
    "Manuela Siqueira Barros",
    "Leonardo Farias Duarte",
    "Yasmin Rezende Coelho",
    "Diego Santana Borges",
    "Vitória Campos Alencar",
    "Murilo Pacheco Medeiros",
    "Bianca Tavares Nogueira",
    "Samuel Prado Figueiredo",
    "Carolina Cunha Queiroz",
    "Otávio Gomes Vasconcelos",
    "Clara Monteiro Braga",
]


def stable_id(kind: str, username: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{kind}/{username}"))


def build_accounts(mode: str) -> dict[str, dict]:
    accounts: dict[str, dict] = {
        "admin": {
            "username": "admin",
            "login": "admin@gmail.com",
            "email": "admin@gmail.com",
            "password": DEFAULT_DEMO_CREDENTIAL,
            "sub": "",
            "profileId": stable_id("campus-profile", "admin"),
            "scenario": "Administrador da plataforma e da universidade (PLATFORM_ADMIN)",
            "roles": ["USER", "PLATFORM_ADMIN"],
            "profile": {
                "name": "Administrador UNIR",
                "registrationCode": "ADMIN-0001",
                "affiliationStatus": "PROFESSOR",
                "academicLevel": "PHD",
                "courseName": "Ciência da Computação",
                "departmentUnitCode": "ICET",
                "departmentCode": "DCC",
                "interests": ["Gestão Universitária"],
            },
        }
    }

    if mode == "clean":
        return accounts

    for index, full_name in enumerate(PROFESSOR_NAMES, start=1):
        alias = f"professor{index}"
        is_dcc = index <= 5
        dept_code = "DCC" if is_dcc else "DEG"
        course_name = "Ciência da Computação" if is_dcc else "Engenharia de Controle e Automação"
        reg_code = f"SIAPE-{10000 + index}" if is_dcc else f"SIAPE-{20000 + index}"
        accounts[alias] = {
            "username": alias,
            "login": f"{alias}@gmail.com",
            "email": f"{alias}@gmail.com",
            "password": DEFAULT_DEMO_CREDENTIAL,
            "sub": "",
            "profileId": stable_id("campus-profile", alias),
            "scenario": f"Professor verificado do departamento {dept_code}",
            "roles": ["USER"],
            "profile": {
                "name": full_name,
                "registrationCode": reg_code,
                "affiliationStatus": "PROFESSOR",
                "academicLevel": "PHD",
                "courseName": course_name,
                "departmentUnitCode": "ICET",
                "departmentCode": dept_code,
                "interests": ["Pesquisa", "Ensino", "Extensão"],
            },
        }

    for index, full_name in enumerate(STUDENT_NAMES, start=1):
        alias = f"aluno{index}"
        is_dcc = index <= 20
        dept_code = "DCC" if is_dcc else "DEG"
        course_name = "Ciência da Computação" if is_dcc else "Engenharia de Controle e Automação"
        reg_code = f"202610{index:03d}" if is_dcc else f"202620{index:03d}"
        accounts[alias] = {
            "username": alias,
            "login": f"{alias}@gmail.com",
            "email": f"{alias}@gmail.com",
            "password": DEFAULT_DEMO_CREDENTIAL,
            "sub": "",
            "profileId": stable_id("campus-profile", alias),
            "scenario": f"Estudante de {course_name} ({dept_code})",
            "roles": ["USER"],
            "profile": {
                "name": full_name,
                "registrationCode": reg_code,
                "affiliationStatus": "STUDENT",
                "academicLevel": "UNDERGRAD",
                "courseName": course_name,
                "departmentUnitCode": "ICET",
                "departmentCode": dept_code,
                "interests": ["Computação", "Inovação"] if is_dcc else ["Engenharia", "Automação"],
            },
        }

    return accounts


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


def parse_args() -> argparse.Namespace:
    default_mode = os.getenv("UNIR_SEED_MODE", "demo").strip().lower() or "demo"
    parser = argparse.ArgumentParser(description="Prepare local UNIR accounts manifest.")
    parser.add_argument(
        "--mode",
        choices=("clean", "demo"),
        default=default_mode if default_mode in ("clean", "demo") else "demo",
        help="Seed mode: 'clean' (1 admin) or 'demo' (1 admin + 10 professors + 40 students).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    previous = {}
    if OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8")).get("accounts", {})
        except (json.JSONDecodeError, OSError):
            previous = {}

    accounts = build_accounts(args.mode)
    for username, entry in accounts.items():
        old = previous.get(username, {})
        if old.get("email") == entry["email"] and old.get("sub"):
            entry["sub"] = old["sub"]

    write_private_json({"version": 2, "mode": args.mode, "realm": "unir", "accounts": accounts})
    print(f"Arquivo local criado/atualizado no modo '{args.mode}' com {len(accounts)} conta(s): {OUTPUT}")


if __name__ == "__main__":
    main()
