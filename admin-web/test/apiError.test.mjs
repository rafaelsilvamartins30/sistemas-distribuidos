import assert from "node:assert/strict";
import test from "node:test";
import { CampusOverviewError, createSemester } from "../dist-test/services/campusOverview.js";
import { parseApiError } from "../dist-test/utils/apiError.js";

test("parseApiError surfaces Campus ProblemDetail message", async () => {
  const response = new Response(
    JSON.stringify({
      title: "Unprocessable Entity",
      status: 422,
      detail: "Data final deve ser posterior à data inicial.",
    }),
    { status: 422, headers: { "content-type": "application/problem+json" } },
  );

  const parsed = await parseApiError(response);
  assert.equal(parsed.status, 422);
  assert.equal(parsed.message, "Data final deve ser posterior à data inicial.");
});

test("CampusOverviewError preserves backend validation detail", async () => {
  await assert.rejects(
    () =>
      createSemester(
        "http://localhost:18084",
        "jwt-token",
        { name: "2027/1", startOn: "2027-06-01", endOn: "2027-01-01" },
        async () =>
          new Response(JSON.stringify({ detail: "Semestre 2027/1 já está cadastrado." }), {
            status: 422,
            headers: { "content-type": "application/problem+json" },
          }),
      ),
    (error) =>
      error instanceof CampusOverviewError &&
      error.status === 422 &&
      error.message === "Semestre 2027/1 já está cadastrado.",
  );
});
