import type { AffiliationStatus } from "../services/userProfile.js";
import type { ProfessorVerificationRequest } from "../services/opportunities.js";

export function shouldPromptForProfessorVerification(
  profileStatus: AffiliationStatus | "",
  requestStatus: ProfessorVerificationRequest["status"] | null,
): boolean {
  return profileStatus === "PROFESSOR" && requestStatus === null;
}
