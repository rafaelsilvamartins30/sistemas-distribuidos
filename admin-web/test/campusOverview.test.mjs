import assert from "node:assert/strict";
import test from "node:test";
import { CampusOverviewError, getCampusOverview } from "../dist-test/services/campusOverview.js";

test("getCampusOverview reads the university directory through the Gateway", async () => {
  const requests = [];
  const university = {
    id: "unir",
    name: "Universidade Federal do Rio de Janeiro",
    acronym: "UFRJ",
    description: "Rede universitária",
    currentTerm: "2025.1",
  };

  const result = await getCampusOverview("http://localhost:18084/", "jwt-token", async (url, init) => {
    requests.push({ url: String(url), headers: init?.headers });
    const body = String(url).endsWith("/university")
      ? university
      : { items: [], totalElements: 0, page: 0, size: 20, totalPages: 0 };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(requests.length, 4);
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "http://localhost:18084/api/v1/web/university",
      "http://localhost:18084/api/v1/web/departments?page=0&size=20&sort=name",
      "http://localhost:18084/api/v1/web/entities?page=0&size=20&sort=name",
      "http://localhost:18084/api/v1/web/communities?page=0&size=20&sort=name",
    ],
  );
  assert.ok(requests.every((request) => request.headers?.Authorization === "Bearer jwt-token"));
  assert.equal(result.university.acronym, "UFRJ");
  assert.equal(result.departments.totalElements, 0);
  assert.equal(result.communities.totalElements, 0);
});

test("getCampusOverview surfaces Gateway failures", async () => {
  await assert.rejects(
    () => getCampusOverview("http://localhost:18084", "jwt-token", async () => new Response(null, { status: 503 })),
    (error) => error instanceof CampusOverviewError && error.status === 503,
  );
});
