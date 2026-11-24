import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminApiError,
  extractRoles,
  fetchAdminProfile,
  hasPlatformAdminRole,
} from "../dist-test/services/adminSession.js";

test("extractRoles and hasPlatformAdminRole identify PLATFORM_ADMIN role", () => {
  const tokenPayload = {
    sub: "admin-1",
    realm_access: {
      roles: ["USER", "PLATFORM_ADMIN"],
    },
  };

  assert.deepEqual(extractRoles(tokenPayload), ["USER", "PLATFORM_ADMIN"]);
  assert.equal(hasPlatformAdminRole(tokenPayload), true);
  assert.equal(hasPlatformAdminRole({ sub: "user-1", realm_access: { roles: ["USER"] } }), false);
});

test("fetchAdminProfile forwards bearer token to Gateway and returns Campus profile contract", async () => {
  let requestedUrl;
  let requestedHeaders;
  const mockProfile = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Ana Silva",
    institutionalId: "202420228",
    affiliationStatus: "PROFESSOR",
    academicLevel: "DOCTORATE",
    course: "Ciência da Computação",
    department: "Departamento de Ciência da Computação",
    interests: ["Sistemas Distribuídos"],
    createdAt: "2026-10-14T12:00:00Z",
    updatedAt: "2026-10-14T12:00:00Z",
    email: "admin@unir.edu.br",
    emailVerified: true,
  };

  const result = await fetchAdminProfile("http://localhost:18084/", "jwt-token", async (url, init) => {
    requestedUrl = url;
    requestedHeaders = init?.headers;
    return new Response(JSON.stringify(mockProfile), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  assert.equal(requestedUrl, "http://localhost:18084/api/v1/admin/me");
  assert.deepEqual(requestedHeaders, { Authorization: "Bearer jwt-token" });
  assert.deepEqual(result, mockProfile);
});

test("fetchAdminProfile throws AdminApiError with status 403 when Gateway denies common user", async () => {
  await assert.rejects(
    () =>
      fetchAdminProfile("http://localhost:18084", "user-token", async () => {
        return new Response(null, { status: 403 });
      }),
    (error) => {
      assert.equal(error instanceof AdminApiError, true);
      assert.equal(error.status, 403);
      assert.equal(error.message, "Você não tem permissão para acessar este painel.");
      assert.equal(error.message.includes("PLATFORM_ADMIN"), false);
      return true;
    },
  );
});
