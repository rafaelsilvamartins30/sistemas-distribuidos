import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { CampusSpaceCard } from "../src/components/CampusSpaceCard.js";
import { DepartmentCard } from "../src/components/DepartmentCard.js";
import { PaginationControls } from "../src/components/PaginationControls.js";
import {
  CampusApiError,
  getAcademicUnit,
  getAcademicUnits,
  getAcademicEntities,
  getAcademicEntity,
  getCommunities,
  getCommunity,
  getDepartment,
  getDepartments,
  getCourses,
  getUniversity,
  type AcademicEntity,
  type AcademicUnit,
  type CatalogCourse,
  type Community,
  type Department,
  type University,
} from "../src/services/campus.js";

const university: University = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Universidade Federal de Lavras",
  acronym: "UFLA",
  description: "Universidade Federal de Lavras.",
  generalInfoMarkdown: "Informações gerais da UFLA.",
  currentTerm: "2026/2",
  logoUrl: null,
  bannerUrl: null,
  links: [],
};

const academicEntity: AcademicEntity = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Entidade de Demonstração do DCC",
  description: "Registro de demonstração local do Campus.",
  generalInfoMarkdown: "Informações gerais.",
  entityType: "Demonstração",
  departmentId: "10000000-0000-4000-8000-000000000001",
  logoUrl: null,
  bannerUrl: null,
  links: [],
  sourceUrl: "https://proeec.ufla.br",
  sourceAffiliationText: "Departamento de Ciência da Computação",
  referenceOnly: true,
};

const community: Community = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "Comunidade de Demonstração",
  description: "Registro de demonstração local do Campus.",
  generalInfoMarkdown: "Informações gerais.",
  category: null,
  departmentId: null,
  logoUrl: null,
  bannerUrl: null,
  links: [],
};

const department: Department = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Departamento de Ciência da Computação",
  acronym: "DCC",
  description: "Departamento de Ciência da Computação da UFLA.",
  generalInfoMarkdown: "Informações gerais do Departamento de Ciência da Computação.",
  logoUrl: null,
  bannerUrl: null,
  links: [],
  sourceUrl: "https://ufla.br/sobre/administracao/unidades-academicas",
  courses: [],
};

const academicUnit: AcademicUnit = {
  id: "unit-icet",
  code: "ICET",
  name: "Instituto de Ciências Exatas e Tecnológicas",
  description: "Unidade acadêmica de demonstração.",
  generalInfoMarkdown: "Informações gerais da unidade.",
  logoUrl: null,
  bannerUrl: null,
  links: [],
  sourceUrl: "https://ufla.br/sobre/administracao/unidades-academicas",
  referenceOnly: true,
};

const course: CatalogCourse = {
  id: "course-1",
  name: "Sistemas de Informação",
  departmentId: department.id,
};

test("university and department services query the Gateway with the bearer token", async () => {
  const requested: Array<[string, HeadersInit | undefined]> = [];
  const fetchImpl: typeof globalThis.fetch = async (url, init) => {
    requested.push([String(url), init?.headers]);
    const response = String(url).endsWith("/university")
      ? university
      : String(url).includes("departments/10000000")
        ? department
        : { items: [department], page: 0, size: 20, totalElements: 1, totalPages: 1 };
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  };

  const universityResult = await getUniversity("access-token", "http://localhost:18084/", fetchImpl);
  const departmentPage = await getDepartments("access-token", 0, 20, "http://localhost:18084", fetchImpl);
  const departmentResult = await getDepartment("access-token", department.id, "http://localhost:18084", fetchImpl);

  assert.deepEqual(universityResult, university);
  assert.deepEqual(departmentPage.items, [department]);
  assert.deepEqual(departmentResult, department);
  assert.deepEqual(requested, [
    ["http://localhost:18084/api/v1/web/university", { Authorization: "Bearer access-token" }],
    [
      "http://localhost:18084/api/v1/web/departments?page=0&size=20&sort=name",
      { Authorization: "Bearer access-token" },
    ],
    [`http://localhost:18084/api/v1/web/departments/${department.id}`, { Authorization: "Bearer access-token" }],
  ]);
});

test("department service surfaces Gateway not found responses", async () => {
  await assert.rejects(
    () =>
      getDepartment(
        "access-token",
        "missing",
        "http://localhost:18084",
        async () => new Response(null, { status: 404 }),
      ),
    (error: unknown) => error instanceof CampusApiError && error.status === 404,
  );
});

test("department card displays data returned by Campus", () => {
  const markup = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(DepartmentCard, { department })));

  assert.match(markup, /Departamento de Ciência da Computação/);
  assert.match(markup, /Departamento de Ciência da Computação da UFLA/);
  assert.match(markup, /href="\/departamentos\/10000000-0000-4000-8000-000000000001"/);
});

test("academic catalog services treat units as peer profiles and filter courses by department", async () => {
  const requested: string[] = [];
  const fetchImpl: typeof globalThis.fetch = async (url) => {
    const path = String(url);
    requested.push(path);
    const body = path.includes("/academic-units?")
      ? { items: [academicUnit], page: 0, size: 20, totalElements: 1, totalPages: 1 }
      : path.endsWith(`/academic-units/${academicUnit.id}`)
        ? academicUnit
        : path.includes("/courses?")
          ? { items: [course], page: 0, size: 100, totalElements: 1, totalPages: 1 }
          : course;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };

  const unitPage = await getAcademicUnits("access-token", 0, 20, "http://localhost:18084", fetchImpl);
  const unitDetail = await getAcademicUnit("access-token", academicUnit.id, "http://localhost:18084", fetchImpl);
  const coursePage = await getCourses("access-token", department.id, 0, 100, "http://localhost:18084", fetchImpl);

  assert.equal(unitPage.items[0].code, "ICET");
  assert.equal(unitDetail.referenceOnly, true);
  assert.equal(coursePage.items[0].departmentId, department.id);
  assert.deepEqual(requested, [
    "http://localhost:18084/api/v1/web/academic-units?page=0&size=20&sort=name",
    `http://localhost:18084/api/v1/web/academic-units/${academicUnit.id}`,
    `http://localhost:18084/api/v1/web/courses?page=0&size=100&departmentId=${department.id}`,
  ]);
});

test("academic entity and community services use paginated Gateway endpoints and forward bearer tokens", async () => {
  const requested: Array<[string, HeadersInit | undefined]> = [];
  const fetchImpl: typeof globalThis.fetch = async (url, init) => {
    requested.push([String(url), init?.headers]);
    const isEntity = String(url).includes("entities");
    const record = String(url).includes("entities/")
      ? academicEntity
      : String(url).includes("communities/")
        ? community
        : null;
    const body = record ?? {
      items: [isEntity ? academicEntity : community],
      page: 1,
      size: 20,
      totalElements: 21,
      totalPages: 2,
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };

  const entityPage = await getAcademicEntities("access-token", 1, "http://localhost:18084/", fetchImpl);
  const entityDetail = await getAcademicEntity("access-token", academicEntity.id, "http://localhost:18084", fetchImpl);
  const communityPage = await getCommunities("access-token", 1, "http://localhost:18084", fetchImpl);
  const communityDetail = await getCommunity("access-token", community.id, "http://localhost:18084", fetchImpl);

  assert.deepEqual(entityPage.items, [academicEntity]);
  assert.deepEqual(entityDetail, academicEntity);
  assert.deepEqual(communityPage.items, [community]);
  assert.deepEqual(communityDetail, community);
  assert.deepEqual(requested, [
    ["http://localhost:18084/api/v1/web/entities?page=1&size=20&sort=name", { Authorization: "Bearer access-token" }],
    [`http://localhost:18084/api/v1/web/entities/${academicEntity.id}`, { Authorization: "Bearer access-token" }],
    [
      "http://localhost:18084/api/v1/web/communities?page=1&size=20&sort=name",
      { Authorization: "Bearer access-token" },
    ],
    [`http://localhost:18084/api/v1/web/communities/${community.id}`, { Authorization: "Bearer access-token" }],
  ]);
});

test("academic entity and community cards show Campus values and point to their details", () => {
  const markup = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(CampusSpaceCard, {
        id: academicEntity.id,
        name: academicEntity.name,
        description: academicEntity.description,
        kind: academicEntity.entityType,
        detailPath: `/entidades/${academicEntity.id}`,
        logoUrl: academicEntity.logoUrl,
        bannerUrl: academicEntity.bannerUrl,
      }),
    ),
  );

  assert.match(markup, /Entidade de Demonstração do DCC/);
  assert.match(markup, /href="\/entidades\/20000000-0000-4000-8000-000000000001"/);

  const pagination = renderToStaticMarkup(
    createElement(PaginationControls, { page: 0, totalPages: 2, onPageChange: () => {} }),
  );
  assert.match(pagination, /Página 1 de 2/);
  assert.match(pagination, /Próxima/);
});
