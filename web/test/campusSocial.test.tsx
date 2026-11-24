import assert from "node:assert/strict";
import test from "node:test";
import { getCampusFeed, getInstitutionalPosts } from "../src/services/campusSocial.js";

test("followed feed loads recent posts without a semester filter", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await getCampusFeed("campus-token");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestedUrl, "/api/v1/web/feed?page=0&size=20");
});

test("institutional post history uses the selected semester without an expiry toggle", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("Authorization"),
    });
    return new Response(JSON.stringify({ items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await getInstitutionalPosts("campus-token", "DEPARTMENT", "department / one", "2026/2");
    await getInstitutionalPosts("campus-token", "DEPARTMENT", "department-1", "2026/1");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    {
      url: "/api/v1/web/profiles/DEPARTMENT/department%20%2F%20one/posts?term=2026%2F2&page=0&size=20",
      authorization: "Bearer campus-token",
    },
    {
      url: "/api/v1/web/profiles/DEPARTMENT/department-1/posts?term=2026%2F1&page=0&size=20",
      authorization: "Bearer campus-token",
    },
  ]);
});
