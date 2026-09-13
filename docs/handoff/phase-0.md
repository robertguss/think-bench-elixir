# Phase 0 handoff — Scaffold

Worker: Opus, 2026-09-12. Scope: Phase 0 only. Phase 1 not started.

## What was built

- Phoenix 1.8.13 app `think_bench` generated in the repo root with
  `mix igniter.new think_bench --with phx.new --with-args="--no-live --binary-id" --install ash,ash_postgres,ash_phoenix,ash_ai --no-git --yes`
  (generated in a scratch directory, then copied in so `docs/`, `prototype/` and
  git history were untouched).
- Ash 3.33, AshPostgres 2.13, AshPhoenix 2.3, AshAi 1.0, Igniter 0.8. Versions checked
  on Hex first; `mix.exs` constraints tightened to those minors (the installer wrote
  `~> 3.0` / `~> 2.0`). Exact versions are in `mix.lock`. No domains or resources yet.
- `docker-compose.yml`: Postgres 17 on `localhost:5432`, `postgres/postgres`, named
  volume, healthcheck. `config/dev.exs` and `config/test.exs` use the generator
  defaults, which match it. `ThinkBench.Repo.min_pg_version/0` set to 17.0.0 (the
  installer had written 18.6.0 from the host's `postgres -V`).
- React in `assets/`, bundled by Phoenix's esbuild (no Vite):
  - `assets/package.json` with pinned `react`/`react-dom` 19.2.8, `@xyflow/react`
    12.11.6 (installed, unused), `typescript` 7.0.2, `@types/react` 19.2.18,
    `@types/react-dom` 19.2.7, and `phoenix`/`phoenix_html` as `file:../deps/*`.
    `package-lock.json` committed.
  - `assets/tsconfig.json` (strict, `jsx: react-jsx`, bundler resolution).
  - `assets/js/main.tsx` is the esbuild entry, mounting `assets/js/App.tsx` into `#root`.
  - esbuild args: `js/main.tsx --bundle --jsx=automatic --entry-names=app ...`, so the
    output is still `priv/static/assets/js/app.js` and the root layout is unchanged.
- `/` renders `page_html/home.html.heex`, which is just `<div id="root"></div>`. The
  React root renders "Think Bench" centred with Tailwind utility classes (stone palette,
  `dark:` variant).
- Tailwind v4 via Phoenix's `tailwind` package, config as generated (daisyUI plugin and
  its themes kept; nothing uses them yet).
- Mix aliases:
  - `assets.setup` also runs `npm install` in `assets/`, so `mix setup` installs JS deps.
  - `assets.typecheck` runs `npx tsc --noEmit` in `assets/`.
  - `precommit`: `compile --warnings-as-errors`, `deps.unlock --check-unused`,
    `format --check-formatted`, `test`, `assets.typecheck`.
- README rewritten with setup, run and check commands.
- `.gitignore` merged: generator entries plus the original `*.beam`, `.DS_Store`,
  `.env`; `node_modules/` generalised from `/assets/node_modules/`.
- Page title set to "Think Bench" (generator suffix removed). Page controller test
  replaced to assert the `#root` mount point and the `app.js` script tag.

## Verified, and how

- `docker compose up -d --wait` → container healthy.
- `mix setup` passes from this state (deps, `ash.setup` creates DB and runs the
  extensions migration, npm install: 0 vulnerabilities, assets build, seeds).
- `mix precommit` passes: 5 tests, 0 failures; format check clean; tsc clean.
- The typecheck gate really gates: a temporary `assets/js/zz_typecheck_probe.ts` with a
  type error made `mix assets.typecheck` exit 1 (TS2322); file removed.
- `mix phx.server`: `curl /` returns the layout with `<div id="root">`;
  `/assets/js/app.js` 200 (~3.4 MB dev build with inline sourcemap);
  `/assets/css/app.css` 200 and contains `.text-5xl`, `.min-h-screen`,
  `.bg-stone-100`, `.tracking-tight`.
- Browser (Chrome, via Claude in Chrome): http://localhost:4000/ shows "Think Bench"
  centred in large type on the dark stone background (OS in dark mode, so the `dark:`
  variant applied). Accessibility tree: `main > heading "Think Bench"`, i.e. rendered
  by React, not server HTML. No console errors after a reload.

## Decisions the plan did not cover

1. **React 19.2.8, not 19.3.0.** `~/.npmrc` sets `min-release-age=7`; React 19.3.0 and
   its types were published 2026-09-09, so npm refused them (surfacing as a confusing
   `ERESOLVE ... react@undefined`). I kept Robert's supply-chain policy and pinned the
   newest releases older than 7 days. Bump to 19.3.x after 2026-09-16 if wanted.
2. **Entry file is `main.tsx`, not `app.tsx`.** macOS's case-insensitive filesystem
   makes `app.tsx` and `App.tsx` the same file. `--entry-names=app` keeps the bundle
   name `app.js`.
3. **TypeScript 7.0.2** (the native compiler; current `latest`). `tsc` is provided by
   the npm package as before.
4. **`--binary-id`** so generated ids are UUIDs, matching the uuid-shaped data model.
5. **`--no-live`**: LiveView socket is commented out in the endpoint and there are no
   LiveView pages. The `phoenix_live_view` dependency stays because core components
   and LiveDashboard (`/dev/dashboard`) need it.
6. **`deps.unlock --check-unused`** instead of the generator's `deps.unlock --unused`,
   and `format --check-formatted` instead of `format`, so precommit checks without
   rewriting files, as the plan's list says.
7. **`req_llm` dependency** was added by the ash_ai installer. It is left as installed;
   the app still never calls a model. Worth deciding in Phase 2 whether to drop it.
8. Removed `assets/vendor/topbar.js` (only used by LiveView navigation). Kept
   `heroicons.js` (Tailwind plugin referenced from `app.css`). Kept the generated
   `AGENTS.md` (Phoenix/Ash usage rules for agents).

## Not done / notes for the reviewer

- No Ash domain, resources, channels or MCP endpoint. Those are Phases 1–3.
- `assets.deploy` does not run `npm install`; a production build would need that
  first. Not needed until deployment exists.
- `docs/DESIGN.md` still lists Vite in the stack; `PLAN.md` and this phase use
  Phoenix's esbuild. I didn't edit DESIGN.md.
- The Ash installers print Elixir 1.20 type-system warnings while compiling some
  dependencies (ash_phoenix, ash_ai, ash_json_api). They are in deps, not our code,
  and do not fail `--warnings-as-errors`.
- Checked only in Chrome's dark scheme; light scheme not viewed.

## Commands

```sh
open -a OrbStack                 # if Docker isn't running
docker compose up -d --wait
mix setup
mix precommit
mix phx.server                   # http://localhost:4000
```
