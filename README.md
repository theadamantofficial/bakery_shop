# vinext-starter

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm run typecheck`: check application and Cloudflare Worker types
- `npm test`: typecheck, build, and verify the rendered bakery experience
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Resolving dependency and type errors

If a build cannot resolve `three`, allow `npm install` to finish before starting
the build. After adding dependencies, commit both `package.json` and
`package-lock.json`. For a fresh checkout or an incomplete local installation,
run `npm ci` to install the exact versions from the lockfile.

Cloudflare runtime types ([documentation](https://developers.cloudflare.com/workers/languages/typescript/)) come from the pinned `@cloudflare/workers-types` dev
dependency, enabled in `tsconfig.json`. `worker/env.d.ts` declares the optional
`DB` binding used by `cloudflare:workers`; it does not provision a database.

Verify the setup with:

```bash
npm ci
npm run lint
npm test
```

`npm test` includes the TypeScript check and production build. Development and
CI installations must include dev dependencies to run these commands.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## The bakery journey

The home page now follows eight connected chapters: arrival, shop, cake counter,
customization, preparation, baking, decoration, and packaging. Select a signature
cake and customize the serving size, frosting, and toppings before submitting a
demo order. Preparation, baking, decoration, and packaging play automatically;
you can help with the ingredients, pause, skip, and revisit unlocked chapters.
Confirmation is a demo and never charges a payment.

`components/bakery-world.ts` owns one Three.js renderer and the persistent shop,
procedural models, camera route, animations, and resource cleanup.
`components/BakeryExperience.tsx` owns accessible controls and order progression.
`components/bakery-order.ts` holds signature recipes and pricing shared by the UI,
3D order ticket, and tests. Sound is opt-in. Reduced motion keeps preparation
visible without idle movement; a WebGL fallback preserves the order flow.

For repeatable browser checks, use an installed Google Chrome and run a local
server in one terminal, then the browser suite in another:

```bash
npm run start -- --hostname 127.0.0.1 --port 3012
npm run test:browser -- http://127.0.0.1:3012
```

Build with `npm test` before starting the production server. The browser suite
checks every automatic stage, prices carried through the order, keyboard and
touch controls, pause/resume, edits, completed chapter revisits, reduced motion,
and WebGL failure / context loss. Desktop and mobile screenshots plus
`results.json` are saved under `.wrangler/browser-qa/`.
# bakery_shop
# bakery_shop
