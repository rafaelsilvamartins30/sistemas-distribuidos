import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { CompetitionCard, SeasonCard } from "../src/components/SportsCatalogCard.js";
import {
  getCompetition,
  getCompetitions,
  getSeason,
  getSeasons,
  getSport,
  getSports,
  SportsApiError,
  type Competition,
  type Season,
  type Sport,
} from "../src/services/sports.js";

const sport: Sport = {
  id: "40000000-0000-4000-8000-000000000001",
  name: "Futsal",
  playersOnField: 5,
  minimumRoster: 7,
  maximumRoster: 12,
  allowsDraw: true,
  winPoints: 3,
  drawPoints: 1,
  lossPoints: 0,
  defaultForfeitScore: 3,
  rulesMarkdown: "Demonstração local; regulamento não oficial.",
  createdByType: "DEPARTMENT",
  createdById: "40000000-0000-4000-8000-000000000002",
  status: null,
};

const competition: Competition = {
  id: "40000000-0000-4000-8000-000000000003",
  title: "Copa demonstrativa do campus",
  sportId: sport.id,
  sportName: sport.name,
  skillLevel: "COMPETITIVE",
  organizerType: "DEPARTMENT",
  organizerId: "40000000-0000-4000-8000-000000000002",
  targetTeamCount: 16,
  rosterMin: 7,
  rosterMax: 12,
  tieBreakers: ["SCORE_DIFFERENCE", "WINS"],
  teamEntryPrice: 15000,
  freeAgentPrice: 2500,
  registrationDeadline: "2027-06-30T23:59:00Z",
  drawSeed: null,
  status: null,
  format: "GROUPS_KNOCKOUT",
};

const season: Season = {
  id: "40000000-0000-4000-8000-000000000004",
  title: "Temporada demonstrativa do campus",
  sportId: sport.id,
  sportName: sport.name,
  skillLevel: "RECREATIONAL",
  organizerType: "DEPARTMENT",
  organizerId: "40000000-0000-4000-8000-000000000002",
  targetTeamCount: 10,
  rosterMin: 7,
  rosterMax: 12,
  tieBreakers: ["HEAD_TO_HEAD"],
  teamEntryPrice: 5000,
  freeAgentPrice: 1000,
  registrationDeadline: "2027-06-30T23:59:00Z",
  status: null,
  roundRobinMode: "double round-robin",
};

test("catalog services send supported filters and bearer token to the Gateway", async () => {
  const calls: Array<[string, HeadersInit | undefined]> = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    calls.push([String(input), init?.headers]);
    return new Response(JSON.stringify({ items: [], page: 0, size: 10, totalElements: 0, totalPages: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await getSports("token", { q: "futsal universitário" }, "http://localhost:18084", fetchImpl);
  await getCompetitions(
    "token",
    {
      page: 1,
      size: 10,
      sportId: sport.id,
      skillLevel: "COMPETITIVE",
      organizerType: "DEPARTMENT",
      organizerId: competition.organizerId,
      targetTeamCount: 16,
    },
    "http://localhost:18084",
    fetchImpl,
  );
  await getSeasons("token", { sportId: sport.id, targetTeamCount: 10 }, "http://localhost:18084", fetchImpl);

  assert.deepEqual(calls, [
    [
      "http://localhost:18084/api/v1/web/sports?page=0&size=20&q=futsal+universit%C3%A1rio",
      { Authorization: "Bearer token" },
    ],
    [
      `http://localhost:18084/api/v1/web/competitions?page=1&size=10&sportId=${sport.id}&skillLevel=COMPETITIVE&organizerType=DEPARTMENT&organizerId=${competition.organizerId}&targetTeamCount=16`,
      { Authorization: "Bearer token" },
    ],
    [
      `http://localhost:18084/api/v1/web/seasons?page=0&size=20&sportId=${sport.id}&targetTeamCount=10`,
      { Authorization: "Bearer token" },
    ],
  ]);
});

test("detail services request persisted records and surface gateway status", async () => {
  const responses = [sport, competition, season];
  const paths: string[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input) => {
    paths.push(String(input));
    const body = responses[paths.length - 1];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.deepEqual(await getSport("token", sport.id, "http://gateway", fetchImpl), sport);
  assert.deepEqual(await getCompetition("token", competition.id, "http://gateway", fetchImpl), competition);
  assert.deepEqual(await getSeason("token", season.id, "http://gateway", fetchImpl), season);
  assert.deepEqual(paths, [
    `http://gateway/api/v1/web/sports/${sport.id}`,
    `http://gateway/api/v1/web/competitions/${competition.id}`,
    `http://gateway/api/v1/web/seasons/${season.id}`,
  ]);
  await assert.rejects(
    () => getCompetition("token", "missing", "http://gateway", async () => new Response(null, { status: 404 })),
    (error: unknown) => error instanceof SportsApiError && error.status === 404,
  );
});

test("catalog cards use stored attributes and link only to informational details", () => {
  const competitionMarkup = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(CompetitionCard, { competition })),
  );
  const seasonMarkup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(SeasonCard, { season })));

  assert.match(competitionMarkup, /Copa demonstrativa do campus/);
  assert.match(competitionMarkup, /Fase de grupos e mata-mata/);
  assert.match(competitionMarkup, /16/);
  assert.match(competitionMarkup, new RegExp(`/esportes/campeonatos/${competition.id}`));
  assert.match(seasonMarkup, /Turno e returno/);
  assert.match(seasonMarkup, new RegExp(`/esportes/temporadas/${season.id}`));
  assert.doesNotMatch(`${competitionMarkup}${seasonMarkup}`, /Inscrever-se|Garantir vaga|Classificação/);
});
