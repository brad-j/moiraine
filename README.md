# moiraine

The app for [gaidin](../gaidin): each agent's conversations in a sidebar, its home conversation pinned and its threads below, with the pages gaidin's web view has now. It's a client of gaidin's HTTP API, built with TanStack Start in SPA mode and served by gaidin from the same origin. In the Wheel of Time, Moiraine is the Aes Sedai bonded to her Warder.

The design, decisions and order of work are in gaidin's `docs/plan.md`, under "Design: the app".

## Development

Needs gaidin checked out beside this directory (`../gaidin`, with its dependencies installed): the API types come from its `src/web.ts`, and `pnpm dev:faux` runs its e2e server.

```sh
pnpm install
pnpm dev:faux    # the app against gaidin's e2e server: a scripted model, no keys, a throwaway data directory
pnpm dev         # the app against a gaidin already running at GAIDIN_URL (default http://127.0.0.1:8410)
pnpm check       # build, type check, lint, and the transcript test against gaidin's e2e server
pnpm e2e         # build, then the Playwright tests, each against its own gaidin e2e server serving the build at /app/
```

`pnpm dev` passes `/api` and `/events` to gaidin with `Tailscale-User-Login` set to `GAIDIN_WEB_USER` (default `brad@example.com`, which the e2e server lets in), as `tailscale serve` would. It needs to match `web.user` in that gaidin's settings.

The build is `dist/client`, built for `/app/`: hashed assets and `_shell.html`, the page gaidin serves for every path under `/app/` that isn't a file. gaidin serves it from the directory its `web.app` setting names. `dist/server` is a by-product of Start's build and isn't deployed.

## Layout

- `src/api.ts`: the only import from gaidin, types only, and the requests. `PROTOCOL` fails `tsc` when gaidin raises its protocol version, and the app says so when the gaidin it talks to speaks another.
- `src/queries.ts`: gaidin's GETs as TanStack Query queries; the event stream (`src/conversation/stream.ts`) invalidates the ones its events affect.
- `src/transcript.ts`: a conversation rebuilt from its event stream, from gaidin's `web/transcript.ts`.
- `src/conversation/`: the log, the dock (every agent's approvals and questions), the prompt with its commands, and the status line, as gaidin's console has them.
- `src/sidebar.tsx`: the agent switcher, the home conversation, New thread, and the agent's threads, job runs and conversations from other agents, virtualized and loaded as it scrolls. On a phone it's a drawer.
- `src/routes/`: `/<agent>` (home), `/<agent>/t/<id>` (a thread), `/<agent>/new` (a thread about to start), under `/app/`.

## Status

Step 2 of the plan: the sidebar, a conversation, the dock and the prompt. The pages (schedule, memory, skills, settings, agents, activity) are step 3, so the commands that opened them in the web view aren't here yet. There's no deploy script yet.
