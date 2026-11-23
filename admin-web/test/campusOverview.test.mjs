import assert from "node:assert/strict";
import test from "node:test";
import {
  CampusOverviewError,
  getCampusOverview,
  reviewInstitutionalRequest,
} from "../dist-test/services/campusOverview.js";

test("getCampusOverview reads the administration aggregate through its BFF", async () => {
  const requests = [];
  const university = {
    id: "unir",
    name: "Universidade Federal do Rio de Janeiro",
    acronym: "UFRJ",
    description: "Rede universitária",
    currentTerm: "2025.1",
  };

  const overview = {
    university,
    academicUnits: { items: [], totalElements: 0 },
    departments: { items: [], totalElements: 0 },
    entities: { items: [], totalElements: 0 },
    communities: { items: [], totalElements: 0 },
    pendingRequests: { items: [], totalElements: 0 },
  };
  const result = await getCampusOverview("http://localhost:18084/", "jwt-token", async (url, init) => {
    requests.push({ url: String(url), headers: init?.headers });
    return new Response(JSON.stringify(overview), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "http://localhost:18084/api/v1/admin/overview");
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

test("reviewInstitutionalRequest posts the selected decision through the Admin BFF", async () => {
  let request;
  await reviewInstitutionalRequest(
    "http://localhost:18084/",
    "jwt-token",
    "request 1",
    "approve",
    async (url, init) => {
      request = { url: String(url), init };
      return new Response(null, { status: 200 });
    },
  );

  assert.equal(request.url, "http://localhost:18084/api/v1/admin/requests/request%201/approve");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(request.init.headers, { Authorization: "Bearer jwt-token" });
});
