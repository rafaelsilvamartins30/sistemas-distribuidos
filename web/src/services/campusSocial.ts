import { parseApiError } from "../utils/apiError.js";

export type InstitutionalProfileType = "UNIVERSITY" | "ACADEMIC_UNIT" | "DEPARTMENT" | "ACADEMIC_ENTITY" | "COMMUNITY";

export interface CampusPollOption {
  id: string;
  text: string;
  votes: number | null;
}

export interface CampusPoll {
  id: string;
  question: string;
  closesAt: string | null;
  closed: boolean;
  myVoteOptionId: string | null;
  totalVotes?: number | null;
  options: CampusPollOption[];
}

interface CampusPostBase {
  id: string;
  authorName: string;
  body: string;
  imageUrls: string[];
  externalUrl: string | null;
  availableUntil: string | null;
  createdAt: string;
  poll: CampusPoll | null;
}

export interface FeedPost extends CampusPostBase {
  postType: "OFFICIAL";
  owner: { type: InstitutionalProfileType; id: string; name: string };
  term: string;
}

export interface CommunitySpacePost extends CampusPostBase {
  postType: "COMMUNITY_SPACE";
  community: { type: "COMMUNITY"; id: string; name: string };
  commentsCount: number;
}

export interface CampusComment {
  id: string;
  postId: string;
  parentCommentId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface CampusFollow {
  id: string;
  targetType: InstitutionalProfileType;
  targetId: string;
  targetName: string | null;
  followedAt: string;
}

export interface CampusNotification {
  id: string;
  eventType: string;
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
  readAt: string | null;
  createdAt: string;
}

export interface InstitutionalRequest {
  id: string;
  type: "PROFESSOR_VERIFICATION" | "COMMUNITY_CREATION" | "ENTITY_CREATION";
  title: string;
  requestedByUserId: string;
  requesterName: string | null;
  targetDepartmentId: string | null;
  targetDepartmentName: string | null;
  targetType: "DEPARTMENT" | "UNIVERSITY";
  payload: Record<string, unknown>;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
}

export interface CampusPage<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  unreadCount?: number;
}

export class CampusSocialApiError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `Campus respondeu com status ${status}.`);
    this.name = "CampusSocialApiError";
  }
}

const gatewayUrl =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GATEWAY_URL ?? "";

async function request<T>(token: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${gatewayUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const parsed = await parseApiError(response);
    throw new CampusSocialApiError(response.status, parsed.message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function paginatedPath(path: string, page: number, size: number): string {
  return `${path}${path.includes("?") ? "&" : "?"}page=${page}&size=${size}`;
}

export function getFollowedProfiles(
  token: string,
  target?: { targetType: InstitutionalProfileType; targetId: string },
): Promise<{ items: CampusFollow[] }> {
  const query = target ? `?${new URLSearchParams(target)}` : "";
  return request(token, `/api/v1/web/follows${query}`);
}

export function followProfile(
  token: string,
  targetType: InstitutionalProfileType,
  targetId: string,
): Promise<CampusFollow> {
  return request(token, "/api/v1/web/follows", "POST", { targetType, targetId });
}

export function unfollowProfile(token: string, followId: string): Promise<void> {
  return request(token, `/api/v1/web/follows/${encodeURIComponent(followId)}`, "DELETE");
}

export function getCampusFeed(
  token: string,
  term?: string,
  page = 0,
  size = 20,
): Promise<CampusPage<FeedPost | CommunitySpacePost>> {
  const filter = term ? `?term=${encodeURIComponent(term)}` : "";
  return request(token, paginatedPath(`/api/v1/web/feed${filter}`, page, size));
}

export function getInstitutionalPosts(
  token: string,
  type: InstitutionalProfileType,
  profileId: string,
  term: string,
  page = 0,
  size = 20,
): Promise<CampusPage<FeedPost>> {
  const path = `/api/v1/web/profiles/${encodeURIComponent(type)}/${encodeURIComponent(profileId)}/posts?term=${encodeURIComponent(term)}`;
  return request(token, paginatedPath(path, page, size));
}

export interface CreatePostInput {
  body: string;
  term?: string;
  imageUrls?: string[];
  externalUrl?: string;
  availableUntil?: string;
  poll?: { question: string; options: string[]; closesAt?: string };
}

export function createInstitutionalPost(
  token: string,
  type: InstitutionalProfileType,
  profileId: string,
  input: CreatePostInput,
): Promise<FeedPost> {
  return request(
    token,
    `/api/v1/web/profiles/${encodeURIComponent(type)}/${encodeURIComponent(profileId)}/posts`,
    "POST",
    input,
  );
}

export function getCommunityPosts(
  token: string,
  communityId: string,
  page = 0,
  size = 20,
): Promise<CampusPage<CommunitySpacePost>> {
  const path = `/api/v1/web/communities/${encodeURIComponent(communityId)}/space/posts`;
  return request(token, paginatedPath(path, page, size));
}

export function createCommunityPost(
  token: string,
  communityId: string,
  input: CreatePostInput,
): Promise<CommunitySpacePost> {
  return request(token, `/api/v1/web/communities/${encodeURIComponent(communityId)}/space/posts`, "POST", input);
}

export function getCommunityComments(
  token: string,
  postId: string,
  page = 0,
  size = 100,
): Promise<CampusPage<CampusComment>> {
  return request(
    token,
    paginatedPath(`/api/v1/web/community-space-posts/${encodeURIComponent(postId)}/comments`, page, size),
  );
}

export function createCommunityComment(
  token: string,
  postId: string,
  body: string,
  parentCommentId?: string,
): Promise<CampusComment> {
  return request(token, `/api/v1/web/community-space-posts/${encodeURIComponent(postId)}/comments`, "POST", {
    body,
    ...(parentCommentId ? { parentCommentId } : {}),
  });
}

export function voteOnPoll(token: string, pollId: string, optionId: string): Promise<CampusPoll> {
  return request(token, `/api/v1/web/polls/${encodeURIComponent(pollId)}/votes`, "POST", { optionId });
}

export function getNotifications(token: string, page = 0, unreadOnly = false): Promise<CampusPage<CampusNotification>> {
  const filter = unreadOnly ? "&unreadOnly=true" : "";
  return request(token, `/api/v1/web/notifications?page=${page}&size=20${filter}`);
}

export function markNotificationRead(token: string, notificationId: string): Promise<CampusNotification> {
  return request(token, `/api/v1/web/notifications/${encodeURIComponent(notificationId)}/read`, "POST");
}

export function markAllNotificationsRead(token: string): Promise<void> {
  return request(token, "/api/v1/web/notifications/read-all", "POST");
}

export function getMyInstitutionalRequests(token: string, page = 0): Promise<CampusPage<InstitutionalRequest>> {
  return request(token, paginatedPath("/api/v1/web/requests/me", page, 20));
}

export function getPendingInstitutionalRequests(token: string, page = 0): Promise<CampusPage<InstitutionalRequest>> {
  return request(token, paginatedPath("/api/v1/web/requests/pending", page, 20));
}

export function createInstitutionalRequest(
  token: string,
  type: "COMMUNITY_CREATION" | "ENTITY_CREATION",
  targetDepartmentId: string | null,
  payload: Record<string, unknown>,
): Promise<InstitutionalRequest> {
  return request(token, "/api/v1/web/requests", "POST", { type, targetDepartmentId, payload });
}

export function reviewInstitutionalRequest(token: string, requestId: string, decision: "approve" | "reject") {
  return request<InstitutionalRequest>(
    token,
    `/api/v1/web/requests/${encodeURIComponent(requestId)}/${decision}`,
    "POST",
  );
}
