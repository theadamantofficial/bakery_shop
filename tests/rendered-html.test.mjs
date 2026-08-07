import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Maison Miette experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Maison Miette — Pâtisserie &amp; Boulangerie<\/title>/i);
  assert.match(html, /Every crumb/);
  assert.match(html, /Enter the bakery/);
  assert.match(html, /Today(?:&apos;|&#x27;|')s small/);
  assert.match(html, /Our promise/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("includes accessible navigation and social metadata", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /aria-label="Maison Miette, back to entrance"/);
  assert.match(html, /aria-label="Story progress"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /property="og:image" content="http:\/\/localhost\/og.png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
});
