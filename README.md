# moiraine

The app for [gaidin](../gaidin): each agent's conversations in a sidebar, its home conversation pinned and its threads below, with the pages gaidin's web view has now. It's a client of gaidin's HTTP API, built with TanStack Start in SPA mode and served by gaidin from the same origin. In the Wheel of Time, Moiraine is the Aes Sedai bonded to her Warder.

The design, decisions and order of work are in gaidin's `docs/plan.md`, under "Design: the app".

## Development

Needs gaidin checked out beside this directory (`../gaidin`, with its dependencies installed): the API types come from its `src/web.ts`, and `pnpm dev:faux` runs its e2e server.

```sh
pnpm install
pnpm dev:faux    # the app against gaidin's e2e server: a scripted model, no keys, a throwaway data directory
pnpm dev         # the app against a gaidin already running at GAIDIN_URL (default http://127.0.0.1:8410)
pnpm check       # build, type check and lint
```

`pnpm dev` passes `/api` and `/events` to gaidin with `Tailscale-User-Login` set to `GAIDIN_WEB_USER` (default `brad@example.com`, which the e2e server lets in), as `tailscale serve` would. It needs to match `web.user` in that gaidin's settings.

The build is `dist/client`: hashed assets and `_shell.html`, the page gaidin serves for every path that isn't the API or a file. `dist/server` is a by-product of Start's build and isn't deployed.

## Status

Initial setup: the shell, a typed API client, and a placeholder page that shows the API answers. gaidin doesn't serve the build yet (`web.app`, step 1 of the plan), and there's no deploy script or Playwright suite yet.
