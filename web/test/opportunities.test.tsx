import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { OpportunityCard } from "../src/components/OpportunityCard.js";
import {
  closeOpportunity,
  createOpportunity,
  createProfessorVerificationRequest,
  getManagedOpportunities,
  getMyProfessorVerificationRequests,
  getOpportunity,
  getOpportunities,
  getOpportunityPublisherContexts,
  getProfessorVerificationRequests,
  OpportunityApiError,
  reviewProfessorVerificationRequest,
  updateOpportunity,
  type Opportunity,
} from "../src/services/opportunities.js";

const opportunity: Opportunity = {
  id: "10000000-0000-4000-8000-000000000009",
  title: "Estágio em Engenharia de Software & Dados",
  description: "Atuação no desenvolvimento de microsserviços e pipelines analíticos.",
  publisherType: "DEPARTMENT",
  publisherId: "20000000-0000-4000-8000-000000000001",
  category: "ESTAGIO",
  deadline: "2027-06-30T23:59:00Z",
  externalUrl: "https://example.org/apply",
  imageUrl: null,
  createdAt: "2027-01-15T12:00:00Z",
  status: "ACTIVE",
};

test("getOpportunities sends pagination, model filters, and the bearer token through the Gateway", async () => {
  const page = { items: [opportunity], page: 1, size: 10, totalElements: 11, totalPages: 2 };
  let requestedUrl = "";
  let requestedHeaders: HeadersInit | undefined;

  const result = await getOpportunities(
    "access-token",
    { page: 1, size: 10, q: " software ", category: " ESTAGIO ", publisherType: "DEPARTMENT" },
    "http://localhost:18084/",
    async (url, init) => {
      requestedUrl = String(url);
      requestedHeaders = init?.headers;
      return new Response(JSON.stringify(page), { status: 200, headers: { "content-type": "application/json" } });
    },
  );

  assert.equal(
    requestedUrl,
    "http://localhost:18084/api/v1/web/opportunities?page=1&size=10&q=software&category=ESTAGIO&publisherType=DEPARTMENT",
  );
  assert.deepEqual(requestedHeaders, { Authorization: "Bearer access-token" });
  assert.deepEqual(result, page);
});

test("getOpportunity loads a detail by id and reports Gateway errors", async () => {
  let requestedUrl = "";
  const result = await getOpportunity("access-token", opportunity.id, "http://localhost:18084", async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify(opportunity), { status: 200, headers: { "content-type": "application/json" } });
  });

  assert.equal(requestedUrl, `http://localhost:18084/api/v1/web/opportunities/${opportunity.id}`);
  assert.deepEqual(result, opportunity);
  await assert.rejects(
    () =>
      getOpportunity(
        "access-token",
        "missing",
        "http://localhost:18084",
        async () => new Response(null, { status: 404 }),
      ),
    (error: unknown) => error instanceof OpportunityApiError && error.status === 404,
  );
});

test("OpportunityCard links to the detail and displays the persisted opportunity data", () => {
  const markup = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(OpportunityCard, { opportunity })),
  );

  assert.match(markup, /Estágio em Engenharia de Software &amp; Dados/);
  assert.match(markup, /Atuação no desenvolvimento de microsserviços/);
  assert.match(markup, /Inscrições até/);
  assert.match(markup, /Departamento/);
  assert.match(markup, new RegExp(`/oportunidades/${opportunity.id}`));
  assert.doesNotMatch(markup, /Candidate-se|Candidatar-se/);
});

test("publisher contexts and create requests use the authenticated Gateway contract", async () => {
  const contextResponse = {
    items: [{ publisherType: "DEPARTMENT", publisherId: opportunity.publisherId, name: "DCC" }],
  };
  let callIndex = 0;
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: typeof globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    callIndex += 1;
    return new Response(JSON.stringify(callIndex === 1 ? contextResponse : opportunity), {
      status: callIndex === 1 ? 200 : 201,
      headers: { "content-type": "application/json" },
    });
  };

  assert.deepEqual(
    await getOpportunityPublisherContexts("user-token", "http://localhost:18084", fetchImpl),
    contextResponse,
  );
  const created = await createOpportunity(
    "user-token",
    {
      title: opportunity.title,
      description: opportunity.description,
      publisherType: "DEPARTMENT",
      publisherId: opportunity.publisherId,
      category: "ESTAGIO",
      deadline: opportunity.deadline ?? null,
      externalUrl: opportunity.externalUrl,
      imageUrl: null,
    },
    "http://localhost:18084",
    fetchImpl,
  );

  assert.deepEqual(created, opportunity);
  assert.deepEqual(
    requests.map(({ url, init }) => [url, init?.method, (init?.headers as Record<string, string>).Authorization]),
    [
      ["http://localhost:18084/api/v1/web/opportunities/publisher-contexts", "GET", "Bearer user-token"],
      ["http://localhost:18084/api/v1/web/opportunities", "POST", "Bearer user-token"],
    ],
  );
  assert.equal((requests[1].init?.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.equal(JSON.parse(String(requests[1].init?.body)).publisherId, opportunity.publisherId);
});

test("professor verification and department review use the scoped Campus routes", async () => {
  const request = { id: "request-1", status: "PENDING" };
  const calls: string[] = [];
  const postBodies: unknown[] = [];
  const fetchImpl: typeof globalThis.fetch = async (url, init) => {
    calls.push(`${String(url)} ${init?.method}`);
    if (init?.method === "POST" && init.body !== undefined) postBodies.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(request), { status: 200, headers: { "content-type": "application/json" } });
  };

  await createProfessorVerificationRequest("user-token", "http://localhost:18084", fetchImpl);
  await getProfessorVerificationRequests("user-token", "dept-1", "http://localhost:18084", fetchImpl);
  await reviewProfessorVerificationRequest("user-token", "request-1", "approve", "http://localhost:18084", fetchImpl);

  assert.deepEqual(calls, [
    "http://localhost:18084/api/v1/web/professor-verification-requests POST",
    "http://localhost:18084/api/v1/web/departments/dept-1/professor-verification-requests GET",
    "http://localhost:18084/api/v1/web/professor-verification-requests/request-1/approve POST",
  ]);
  assert.deepEqual(postBodies, [{}]);
});

test("the requester reads their own verification status through the Gateway", async () => {
  const response = { items: [{ id: "request-1", status: "PENDING", targetDepartmentName: "DCC" }] };
  let requestedUrl = "";
  let requestedHeaders: HeadersInit | undefined;
  const result = await getMyProfessorVerificationRequests("user-token", "http://localhost:18084", async (url, init) => {
    requestedUrl = String(url);
    requestedHeaders = init?.headers;
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  assert.equal(requestedUrl, "http://localhost:18084/api/v1/web/professor-verification-requests/me");
  assert.deepEqual(requestedHeaders, { Authorization: "Bearer user-token" });
  assert.deepEqual(result, response);
});

test("managed opportunities, update, and logical close use the authenticated Gateway routes", async () => {
  const managedPage = { items: [opportunity], page: 0, size: 20, totalElements: 1, totalPages: 1 };
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetchImpl: typeof globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      ...(init?.body !== undefined ? { body: JSON.parse(String(init.body)) } : {}),
    });
    const payload =
      init?.method === "DELETE"
        ? { ...opportunity, status: "CLOSED" }
        : init?.method === "PATCH"
          ? opportunity
          : managedPage;
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };

  assert.deepEqual(
    await getManagedOpportunities("user-token", 0, 20, "http://localhost:18084", fetchImpl),
    managedPage,
  );
  assert.deepEqual(
    await updateOpportunity(
      "user-token",
      opportunity.id,
      { title: "Novo título", deadline: "2027-07-01T00:00:00Z" },
      "http://localhost:18084",
      fetchImpl,
    ),
    opportunity,
  );
  const closed = await closeOpportunity("user-token", opportunity.id, "http://localhost:18084", fetchImpl);
  assert.equal(closed.status, "CLOSED");
  assert.deepEqual(calls, [
    { url: "http://localhost:18084/api/v1/web/opportunities/managed?page=0&size=20", method: "GET" },
    {
      url: `http://localhost:18084/api/v1/web/opportunities/${opportunity.id}`,
      method: "PATCH",
      body: { title: "Novo título", deadline: "2027-07-01T00:00:00Z" },
    },
    { url: `http://localhost:18084/api/v1/web/opportunities/${opportunity.id}`, method: "DELETE" },
  ]);
});
