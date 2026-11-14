export type AffiliationStatus = "STUDENT" | "PROFESSOR" | "ALUMNI";
export type AcademicLevel = "UNDERGRADUATE" | "MASTERS" | "DOCTORATE";

export interface UserProfile {
  id: string;
  name: string;
  institutionalId: string;
  affiliationStatus: AffiliationStatus | null;
  academicLevel: AcademicLevel | null;
  course: string;
  department: string;
  interests: string[];
  createdAt: string;
  updatedAt: string;
  email?: string | null;
  emailVerified?: boolean | null;
}

export interface CreateProfileInput {
  name: string;
  institutionalId: string;
  affiliationStatus: AffiliationStatus;
  academicLevel: AcademicLevel;
  course: string;
  department: string;
  interests: string[];
}

export interface UpdateProfileInput {
  name: string;
  affiliationStatus: AffiliationStatus;
  academicLevel: AcademicLevel;
  course: string;
  department: string;
  interests: string[];
}

export class UserProfileApiError extends Error {
  constructor(public readonly status: number) {
    super(`User Service respondeu com status ${status}.`);
    this.name = "UserProfileApiError";
  }
}

const userServiceUrl = import.meta.env.VITE_USER_SERVICE_URL;
let previewProfile: UserProfile | null = {
  id: "local-preview-profile",
  name: "Rafael Silva Martins",
  institutionalId: "202420228",
  affiliationStatus: "STUDENT",
  academicLevel: "UNDERGRADUATE",
  course: "Sistemas de Informação",
  department: "Departamento de Ciência da Computação",
  interests: ["Engenharia de Software", "Segurança de Software"],
  createdAt: "2026-10-14T12:00:00.000Z",
  updatedAt: "2026-10-14T12:00:00.000Z",
};

async function requestProfile(token: string, path: string, method = "GET", body?: object): Promise<UserProfile> {
  const response = await fetch(`${userServiceUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    throw new UserProfileApiError(response.status);
  }

  return response.json() as Promise<UserProfile>;
}

export async function getMyProfile(token: string): Promise<UserProfile | null> {
  if (isStandaloneFrontendPreview()) return previewProfile;
  try {
    return await requestProfile(token, "/users/me");
  } catch (error) {
    if (error instanceof UserProfileApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function createMyProfile(token: string, input: CreateProfileInput): Promise<UserProfile> {
  if (isStandaloneFrontendPreview()) {
    previewProfile = { ...input, id: "local-preview-profile", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    return Promise.resolve(previewProfile);
  }
  return requestProfile(token, "/users", "POST", input);
}

export function updateMyProfile(token: string, input: UpdateProfileInput): Promise<UserProfile> {
  if (isStandaloneFrontendPreview()) {
    if (!previewProfile) return Promise.reject(new Error("Crie o perfil antes de alterá-lo."));
    previewProfile = { ...previewProfile, ...input, updatedAt: new Date().toISOString() };
    return Promise.resolve(previewProfile);
  }
  return requestProfile(token, "/users/me", "PATCH", input);
}
import { isStandaloneFrontendPreview } from "../dev/frontendPreview";
