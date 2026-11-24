import assert from "node:assert/strict";
import test from "node:test";
import { isDateInSemester } from "../src/hooks/useSemesterFilter.js";

const semester = { id: "semester-2026-2", name: "2026/2", startOn: "2026-08-03", endOn: "2026-12-18" };

test("semester date filter includes dates inside the selected semester", () => {
  assert.equal(isDateInSemester("2026-08-03T00:00:00Z", semester), true);
  assert.equal(isDateInSemester("2026-12-18T23:59:59Z", semester), true);
  assert.equal(isDateInSemester("2026-07-31T12:00:00Z", semester), false);
  assert.equal(isDateInSemester("2027-01-10T12:00:00Z", semester), false);
});

test("semester date filter keeps records when no date range is available", () => {
  assert.equal(isDateInSemester("2026-01-01T00:00:00Z", { ...semester, startOn: "", endOn: "" }), true);
  assert.equal(isDateInSemester(undefined, semester), true);
  assert.equal(isDateInSemester("not-a-date", semester), true);
});
