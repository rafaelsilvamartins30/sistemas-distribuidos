import assert from "node:assert/strict";
import test from "node:test";
import { checkInWithEventQr, getMyAttendance } from "../src/services/attendance.js";

const eventId = "10000000-0000-4000-8000-000000000001";

test("getMyAttendance requests the participant-specific state through the Gateway", async () => {
  let url = "";
  const attendance = {
    eventId,
    sessionId: "20000000-0000-4000-8000-000000000001",
    attendanceEntryId: "30000000-0000-4000-8000-000000000001",
    status: "ELIGIBLE" as const,
    registeredAt: "2027-01-15T12:00:00Z",
    checkedAt: null,
  };

  const result = await getMyAttendance("jwt-token", eventId, "http://localhost:18084/", async (input, init) => {
    url = String(input);
    assert.equal(init?.method, "GET");
    assert.deepEqual(init?.headers, { Authorization: "Bearer jwt-token" });
    return new Response(JSON.stringify(attendance), { status: 200 });
  });

  assert.equal(url, `http://localhost:18084/api/v1/web/attendance/me?eventId=${eventId}`);
  assert.deepEqual(result, attendance);
});

test("checkInWithEventQr sends only the QR token and surfaces domain errors", async () => {
  let requestBody: string | null | undefined;
  const checked = {
    checkInId: "40000000-0000-4000-8000-000000000001",
    sessionId: "20000000-0000-4000-8000-000000000001",
    attendanceEntryId: "30000000-0000-4000-8000-000000000001",
    status: "ATTENDED" as const,
    checkedAt: "2027-06-15T17:30:00Z",
  };
  const result = await checkInWithEventQr(
    "jwt-token",
    "opaque-qr-token",
    "http://localhost:18084",
    async (url, init) => {
      assert.equal(String(url), "http://localhost:18084/api/v1/web/attendance/check-ins");
      assert.equal(init?.method, "POST");
      assert.deepEqual(init?.headers, {
        Authorization: "Bearer jwt-token",
        "Content-Type": "application/json",
      });
      requestBody = init?.body as string;
      return new Response(JSON.stringify(checked), { status: 200 });
    },
  );

  assert.equal(requestBody, JSON.stringify({ token: "opaque-qr-token" }));
  assert.deepEqual(result, checked);

  await assert.rejects(
    () =>
      checkInWithEventQr(
        "jwt-token",
        "bad-token",
        "http://localhost:18084",
        async () =>
          new Response(JSON.stringify({ status: 403, detail: "QR token is invalid" }), {
            status: 403,
            headers: { "content-type": "application/problem+json" },
          }),
      ),
    (error: unknown) =>
      error instanceof Error && error.message === "Código QR inválido ou expirado. Peça ou gere um novo código.",
  );
});
