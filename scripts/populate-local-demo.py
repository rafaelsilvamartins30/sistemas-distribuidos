#!/usr/bin/env python3
"""Populate the local Kind demo through the same service APIs used by the UI."""
import concurrent.futures
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = os.environ.get("UNIR_DEMO_BASE_URL", "http://localhost:18080").rstrip("/")
KEYCLOAK_BASE = os.environ.get("UNIR_DEMO_KEYCLOAK_URL", BASE).rstrip("/")
WEB = "/api/v1/web"
ADMIN = "/api/v1/admin"
UTC = dt.timezone.utc


def request(path, token=None, method="GET", body=None, form=False, *, base=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
        data = (urllib.parse.urlencode(body) if form else json.dumps(body)).encode()
    try:
        url = (base or BASE) + path
        with urllib.request.urlopen(urllib.request.Request(url, data, headers, method=method), timeout=25) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace") if not form else "credenciais de demonstração recusadas"
        raise RuntimeError(f"{method} {path}: HTTP {error.code} — {detail}") from None


def login(account):
    return request("/realms/unir/protocol/openid-connect/token", method="POST", form=True, base=KEYCLOAK_BASE, body={
        "grant_type": "password", "client_id": "unir-web",
        "username": account["login"], "password": account["password"],
    })["access_token"]


def pages(path, token):
    for page in range(100):
        sep = "&" if "?" in path else "?"
        result = request(f"{path}{sep}page={page}&size=100", token)
        yield from result["items"]
        if page + 1 >= result.get("totalPages", 1):
            return


def ensure(path, token, body, key, *, read_path=None, read_token=None):
    existing = next((item for item in pages(read_path or path, read_token or token)
                     if item.get(key) == body[key]), None)
    return existing or request(path, token, "POST", body)


def iso(value):
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


def poll(fn, label):
    for _ in range(45):
        try:
            result = fn()
            if result:
                return result
        except RuntimeError as exc:
            if "HTTP 404" not in str(exc):
                raise
        time.sleep(1)
    raise RuntimeError(f"Tempo esgotado aguardando {label}")


def main():
    file = Path(__file__).resolve().parents[1] / "config/local-demo-accounts.json"
    accounts = json.loads(file.read_text())["accounts"]
    users = ["admin", "professor1", "professor6", *(f"aluno{i}" for i in range(1, 21))]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        tokens = dict(zip(users, pool.map(lambda name: login(accounts[name]), users)))
    admin = tokens["admin"]
    now = dt.datetime.now(UTC)
    university = request(f"{WEB}/university", admin)
    term = university["currentTerm"]

    request(f"{ADMIN}/university", admin, "PATCH", {
        "generalInfoMarkdown": (
            "## Vida no campus\n"
            "Consulte os comunicados sobre biblioteca, extensão e atividades do semestre. "
            "Para conversar com outras turmas, siga as comunidades de Computação e Engenharia."
        ),
    })

    for name, interests in {
        "professor1": ["Sistemas distribuídos", "Observabilidade", "Software livre"],
        "professor6": ["Controle digital", "Robótica móvel", "Extensão tecnológica"],
        "aluno1": ["Back-end", "Maratona de programação", "Tênis de mesa"],
        "aluno2": ["Acessibilidade digital", "Pesquisa com usuários", "Tênis de mesa"],
        "aluno3": ["Dados abertos", "Python", "Monitoria de algoritmos"],
    }.items():
        request("/api/v1/me", tokens[name], "PATCH", {"interests": interests})
    print("Perfis docentes e estudantis atualizados.", flush=True)

    university_posts = f"{WEB}/profiles/university/{university['id']}/posts"
    for body in [
        "**Plantão de fim de semestre**\nA biblioteca terá atendimento para formatação de TCC na quarta, das 14h às 17h. Traga o arquivo e suas dúvidas sobre referências.",
        "**Mostra de extensão no campus**\nOs projetos de computação e engenharia vão apresentar protótipos e atividades abertas. Confira a programação de eventos e convide sua turma.",
    ]:
        ensure(university_posts, admin, {"body": body, "term": term}, "body",
               read_path=f"{university_posts}?term={urllib.parse.quote(term)}")
    for community in pages(f"{WEB}/communities", admin):
        if "DCC" in community["name"]:
            body = "Alguém topa revisar filas e idempotência na biblioteca? Posso levar um exemplo de entrega duplicada de mensagens."
            thread = ["Topo! Posso reservar a mesa de estudos para as 14h.",
                      "Levem uma dúvida de cada projeto. A gente pode simular uma falha de consumidor e comparar os resultados."]
        elif "DEG" in community["name"]:
            body = "A bancada do laboratório está livre na quinta à tarde. Quem consegue ajudar a calibrar o sensor do carrinho?"
            thread = ["Levo o multímetro e o cabinho USB que ficaram comigo.",
                      "Anotem as leituras antes e depois da calibração para a gente comparar na próxima reunião."]
        else:
            continue
        for name in users:
            token = tokens[name]
            follows = request(f"{WEB}/follows", token)["items"]
            if not any(item["targetId"] == community["id"] for item in follows):
                request(f"{WEB}/follows", token, "POST", {"targetType": "COMMUNITY", "targetId": community["id"]})
        request(f"{ADMIN}/communities/{community['id']}", admin, "PATCH", {
            "generalInfoMarkdown": (
                "Espaço para organizar grupos de estudo, compartilhar materiais e combinar atividades de laboratório. "
                "Ao publicar uma dúvida, indique a disciplina ou o projeto para facilitar as respostas."
            ),
        })
        post = ensure(f"{WEB}/communities/{community['id']}/space/posts", tokens["aluno1"], {"body": body}, "body")
        path = f"{WEB}/community-space-posts/{post['id']}/comments"
        comment = ensure(path, tokens["aluno2"], {"body": thread[0]}, "body")
        teacher = "professor1" if "DCC" in community["name"] else "professor6"
        ensure(path, tokens[teacher], {"body": thread[1], "parentCommentId": comment["id"]}, "body")
    for name in users:
        token = tokens[name]
        if not any(item["targetId"] == university["id"] for item in request(f"{WEB}/follows", token)["items"]):
            request(f"{WEB}/follows", token, "POST", {"targetType": "UNIVERSITY", "targetId": university["id"]})
    print("Publicações e conversas disponíveis no feed.", flush=True)

    org = {"organizerType": "UNIVERSITY", "organizerId": university["id"]}
    for offset, title, location, description in [
        (5, "Oficina de observabilidade para projetos de graduação", "Laboratório de Computação 2",
         "Uma oficina prática para acompanhar uma requisição entre serviços. Traga um notebook e um projeto pequeno para instrumentar."),
        (8, "Mostra de protótipos de automação", "Hall do ICET",
         "Equipes de extensão apresentam um sistema de irrigação, um carrinho autônomo e uma bancada de sensores. Visitação aberta."),
    ]:
        start = (now + dt.timedelta(days=offset)).replace(hour=17, minute=0, second=0)
        event = ensure(f"{WEB}/events", admin, {
            **org, "title": title, "description": description, "location": location, "category": "ACADEMIC",
            "startsAt": iso(start), "endsAt": iso(start + dt.timedelta(hours=2)),
            "registrationDeadline": iso(start - dt.timedelta(days=1)), "registrationMode": "INTERNAL_FREE",
            "capacity": 30, "attendanceEnabled": True, "attendanceMode": "PARTICIPANT_SCANS_EVENT",
        }, "title")
        event_path = f"{WEB}/events/{event['id']}"
        link = event.get("_links", {}).get("self", {}).get("href")
        if link != event_path:
            raise RuntimeError(f"Link público incorreto para {title}: {link}")
        poll(lambda: request(link, admin), "projeção do evento")
    for title, description in [
        ("Voluntariado em acessibilidade de materiais de aula",
         "Grupo de extensão procura estudantes para revisar contraste, legendas e navegação por teclado em materiais didáticos. Dedicação de duas horas por semana."),
        ("Monitoria de laboratório de algoritmos",
         "Atendimento presencial a turmas introdutórias. Interessados devem ter concluído Algoritmos e ter disponibilidade em duas tardes da semana."),
    ]:
        professor = tokens["professor1"] if title.startswith("Monitoria") else tokens["professor6"]
        contexts = request(f"{WEB}/opportunities/publisher-contexts", professor)["items"]
        publisher = next(item for item in contexts if item["publisherType"] == "PROFESSOR")
        ensure(f"{WEB}/opportunities", professor, {
            "title": title, "description": description, "publisherType": publisher["publisherType"],
            "publisherId": publisher["publisherId"], "category": "MONITORIA" if title.startswith("Monitoria") else "EXTENSAO",
            "deadline": iso(now + dt.timedelta(days=14)), "externalUrl": "https://ufla.br/",
        }, "title")
    print("Eventos projetados e oportunidades publicadas.", flush=True)

    sport = ensure(f"{ADMIN}/sports", admin, {
        "name": "Tênis de mesa em duplas", "playersOnField": 2, "minimumRoster": 2, "maximumRoster": 2,
        "allowsDraw": False, "winPoints": 3, "drawPoints": 0, "lossPoints": 0, "defaultForfeitScore": 3,
        "rulesMarkdown": "Melhor de cinco sets. Cada dupla mantém os mesmos dois atletas durante a temporada.",
        "createdByType": "UNIVERSITY", "createdById": university["id"],
    }, "name", read_path=f"{WEB}/sports")
    deadlines = request(f"{WEB}/semesters?page=0&size=100", admin)["items"]
    start = (now + dt.timedelta(days=2)).replace(hour=20, minute=0, second=0)
    while start.weekday() not in (1, 3):
        start += dt.timedelta(days=1)
    # Use a configured semester with room for the 18 match days.
    for semester in sorted(deadlines, key=lambda item: item["startOn"]):
        candidate = max(start, dt.datetime.fromisoformat(semester["startOn"]).replace(hour=20, tzinfo=UTC))
        while candidate.weekday() not in (1, 3):
            candidate += dt.timedelta(days=1)
        if candidate.date() + dt.timedelta(weeks=9) <= dt.date.fromisoformat(semester["endOn"]):
            start = candidate
            break
    else:
        year = (now + dt.timedelta(days=110)).year
        semester_name = f"{year}/1" if now.month >= 9 or now.month <= 2 else f"{year}/2"
        start_on = dt.date(year, 3 if semester_name.endswith("/1") else 8, 1)
        end_on = dt.date(year, 6 if semester_name.endswith("/1") else 11, 30)
        if not any(item["name"] == semester_name for item in deadlines):
            request(f"{ADMIN}/semesters", admin, "POST", {
                "name": semester_name, "startOn": str(start_on), "endOn": str(end_on),
            })
        start = max(start, dt.datetime.combine(start_on, dt.time(20), UTC))
        while start.weekday() not in (1, 3):
            start += dt.timedelta(days=1)

    names = ["Raquetes do DCC", "Dupla do Ipê", "Controle de Mesa", "Rede do ICET", "Efeito Lavras",
             "Saques da Biblioteca", "Topspin do DEG", "Set do Cerrado", "Rali da Cantina", "Dupla do Bosque"]
    for active, title in [(True, "Liga do Campus de Tênis de Mesa"), (False, "Liga Intercursos de Tênis de Mesa")]:
        season = ensure(f"{ADMIN}/seasons", admin, {
            **org, "sportId": sport["id"], "title": title, "skillLevel": "RECREATIONAL",
            "rosterMin": 2, "rosterMax": 2, "teamEntryPrice": 0, "freeAgentPrice": 0,
            "registrationDeadline": iso(start - dt.timedelta(days=1)),
        }, "title", read_path=f"{WEB}/seasons")
        admin_path = f"{ADMIN}/sports-events/SEASON/{season['id']}"
        overview = request(f"{admin_path}/overview", admin)
        for index, name in enumerate(names):
            captain = tokens[f"aluno{2 * index + 1}"]
            partner = tokens[f"aluno{2 * index + 2}"]
            team = next((item for item in overview["teams"] if item["name"] == name), None)
            if not team:
                team = request(f"{WEB}/sports-events/SEASON/{season['id']}/teams", captain, "POST", {
                    "name": name, "reservedPlayerCount": 2,
                })
            if len(team["members"]) < 2:
                code = team.get("inviteCode")
                if not code:
                    mine = request(f"{WEB}/sports-events/SEASON/{season['id']}/overview", captain)
                    code = next(t["inviteCode"] for t in mine["teams"] if t["id"] == team["id"])
                request(f"{WEB}/sports-events/SEASON/{season['id']}/teams/join", partner, "POST", {"inviteCode": code})
        overview = request(f"{admin_path}/overview", admin)
        if len(overview["teams"]) != 10 or any(len(team["members"]) != 2 for team in overview["teams"]):
            raise RuntimeError(f"Elencos incompletos em {title}")
        if active and not overview["matches"]:
            # A historical opening round makes the demonstration show real standings.
            opening = start
            current = next((item for item in deadlines if item["name"] == term), None)
            if current:
                end = dt.date.fromisoformat(current["endOn"])
                candidate = min(now.date() - dt.timedelta(days=7), end - dt.timedelta(weeks=9))
                while candidate.weekday() not in (1, 3):
                    candidate -= dt.timedelta(days=1)
                if candidate >= dt.date.fromisoformat(current["startOn"]):
                    opening = dt.datetime.combine(candidate, dt.time(20), UTC)
                    request(admin_path, admin, "PATCH", {
                        "registrationDeadline": iso(opening - dt.timedelta(days=1)),
                    })
            games = request(f"{admin_path}/matches/generate", admin, "POST", {
                "firstMatchAt": iso(opening), "location": "Centro de Integração Universitária",
            })
            if len(games) != 90:
                raise RuntimeError(f"Esperados 90 jogos, recebidos {len(games)}")
        elif active and overview.get("status") == "OPEN":
            request(f"{admin_path}/matches/generate", admin, "POST", {})
        overview = request(f"{admin_path}/overview", admin)
        expected = 90 if active else 0
        if len(overview["matches"]) != expected:
            raise RuntimeError(f"Esperados {expected} jogos em {title}")
        if active:
            for index, game in enumerate(game for game in overview["matches"] if game["roundNumber"] == 1):
                if game["status"] == "SCHEDULED" and dt.datetime.fromisoformat(game["scheduledAt"].replace("Z", "+00:00")) < now:
                    home, away = [(3, 1), (2, 3), (3, 0), (1, 3), (3, 2)][index]
                    request(f"{ADMIN}/sports-matches/{game['id']}/score", admin, "PATCH", {
                        "homeScore": home, "awayScore": away,
                    })
        overview = request(f"{admin_path}/overview", admin)
        scored = sum(game["status"] == "COMPLETED" for game in overview["matches"])
        print(f"{title}: 10 duplas, {expected} partidas, {scored} placares, estado {overview['status']}.", flush=True)


if __name__ == "__main__":
    main()
