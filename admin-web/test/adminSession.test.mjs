import assert from "node:assert/strict";
import test from "node:test";
import { extractRoles, fetchAdminProfile, hasPlatformAdminRole } from "../dist-test/services/adminSession.js";

test("extractRoles and hasPlatformAdminRole identify PLATFORM_ADMIN role", () => {
  const tokenPayload = {
    sub: "admin-1",
    realm_access: {
      roles: ["ACADEMIC_COMMUNITY", "PLATFORM_ADMIN"],
    },
  };

  assert.deepEqual(extractRoles(tokenPayload), ["ACADEMIC_COMMUNITY", "PLATFORM_ADMIN"]);
  assert.equal(hasPlatformAdminRole(tokenPayload), true);
  assert.equal(hasPlatformAdminRole({ sub: "user-1", realm_access: { roles: ["ACADEMIC_COMMUNITY"] } }), false);
});

test("fetchAdminProfile forwards bearer token to admin-bff", async () => {
  let requestedUrl;
  let requestedHeaders;
  const mockProfile = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@unir.edu.br",
    displayName: "Admin UNIR",
    status: "ACTIVE",
  };

  const result = await fetchAdminProfile("http://localhost:18088/", "jwt-token", async (url, init) => {
    requestedUrl = url;
    requestedHeaders = init?.headers;
    return new Response(JSON.stringify(mockProfile), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  assert.equal(requestedUrl, "http://localhost:18088/api/v1/admin/me");
  assert.deepEqual(requestedHeaders, { Authorization: "Bearer jwt-token" });
  assert.deepEqual(result, mockProfile);
});
