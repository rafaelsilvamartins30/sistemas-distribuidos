import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  InstitutionalLinks,
  InstitutionalProfileTabs,
  MarkdownContent,
} from "../src/components/InstitutionalProfileContent.js";
import { notificationPath } from "../src/pages/NotificationsPage.js";

test("institutional profile markdown renders common blocks without rendering raw HTML", () => {
  const markup = renderToStaticMarkup(
    createElement(MarkdownContent, {
      value:
        "# Secretaria\n\n**Atendimento** de segunda a sexta.\n\n- E-mail: [contato](mailto:contato@unir.br)\n- <script>alert(1)</script>",
    }),
  );

  assert.match(markup, /<h2>Secretaria<\/h2>/);
  assert.match(markup, /<strong>Atendimento<\/strong>/);
  assert.match(markup, /href="mailto:contato@unir\.br"/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
});

test("institutional links are readable and unsafe schemes are not linked", () => {
  const markup = renderToStaticMarkup(
    createElement(InstitutionalLinks, {
      links: [
        { label: "Site", url: "https://unir.example.br" },
        { label: "Inseguro", url: "javascript:alert(1)" },
      ],
    }),
  );

  assert.match(markup, /Links e contatos/);
  assert.match(markup, /href="https:\/\/unir\.example\.br"/);
  assert.match(markup, /Inseguro/);
  assert.doesNotMatch(markup, /href="javascript:/);
});

test("community profiles get a community-only tab", () => {
  const institutional = renderToStaticMarkup(
    createElement(InstitutionalProfileTabs, {
      selected: "profile",
      onSelect: () => undefined,
    }),
  );
  const community = renderToStaticMarkup(
    createElement(InstitutionalProfileTabs, {
      selected: "community",
      community: true,
      onSelect: () => undefined,
    }),
  );

  assert.doesNotMatch(institutional, /Central da comunidade/);
  assert.match(community, /Central da comunidade/);
  assert.match(community, /aria-selected="true"/);
});

test("notifications open the right institutional profile tab", () => {
  const base = {
    id: "notice",
    eventType: "FOLLOWED_PROFILE_POST",
    title: "Aviso",
    message: "Mensagem",
    readAt: null,
    createdAt: "2026-11-20T12:00:00Z",
  };
  assert.equal(
    notificationPath({ ...base, resourceType: "DEPARTMENT", resourceId: "dept / 1" }),
    "/departamentos/dept%20%2F%201?tab=posts",
  );
  assert.equal(
    notificationPath({ ...base, resourceType: "COMMUNITY", resourceId: "community-1" }),
    "/comunidades/community-1?tab=community",
  );
  assert.equal(notificationPath({ ...base, resourceType: "REQUEST", resourceId: "request-1" }), "/solicitacoes");
});
