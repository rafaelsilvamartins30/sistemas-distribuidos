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
    super(`Gateway respondeu com status ${status}.`);
    this.name = "UserProfileApiError";
  }
}

const gatewayUrl = import.meta.env.VITE_GATEWAY_URL ?? "";

async function requestProfile(token: string, path: string, method = "GET", body?: object): Promise<UserProfile> {
  const response = await fetch(`${gatewayUrl}${path}`, {
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
  try {
    return await requestProfile(token, "/api/v1/me");
  } catch (error) {
    if (error instanceof UserProfileApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export function createMyProfile(token: string, input: CreateProfileInput): Promise<UserProfile> {
  return requestProfile(token, "/api/v1/users", "POST", input);
}

export function updateMyProfile(token: string, input: UpdateProfileInput): Promise<UserProfile> {
  return requestProfile(token, "/api/v1/me", "PATCH", input);
}
