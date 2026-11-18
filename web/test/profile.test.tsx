import assert from "node:assert/strict";
import test from "node:test";
import { shouldPromptForProfessorVerification } from "../src/pages/profileFlow.js";

test("a professor profile prompts for verification only when no request exists", () => {
  assert.equal(shouldPromptForProfessorVerification("PROFESSOR", null), true);
  assert.equal(shouldPromptForProfessorVerification("STUDENT", null), false);
  assert.equal(shouldPromptForProfessorVerification("ALUMNI", null), false);
  assert.equal(shouldPromptForProfessorVerification("PROFESSOR", "PENDING"), false);
  assert.equal(shouldPromptForProfessorVerification("PROFESSOR", "APPROVED"), false);
  assert.equal(shouldPromptForProfessorVerification("PROFESSOR", "REJECTED"), false);
});
