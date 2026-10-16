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
pnpm ship        # build and copy to gaidin's VM (GAIDIN_HOST, default ubuntu@gaidin); --dry-run only checks
pnpm e2e         # build, then the Playwright tests, each against its own gaidin e2e server serving the build
```

With `FAUX_TOKENS_PER_SECOND=60 pnpm dev:faux` the scripted model streams its answers at about that pace, as a real one does, to see how the log draws them; "markdown" gets a long one.

`pnpm dev` passes `/api` and `/events` to gaidin with `Tailscale-User-Login` set to `GAIDIN_WEB_USER` (default `brad@example.com`, which the e2e server lets in), as `tailscale serve` would. It needs to match `web.user` in that gaidin's settings.

The build is `dist/client`: hashed assets, `_shell.html`, the page gaidin serves for every path that isn't the API or a file, `precache.json`, the list of those assets the service worker keeps, and what's in `public/`: the service worker (`sw.js`), the manifest and the icons, at the paths gaidin's web view had them. gaidin serves it from the directory its `web.app` setting names. `dist/server` is a by-product of Start's build and isn't deployed.

## Design

`design.md` is the design system (a dark, console-like tool with a chat client's gutter in the log: Fira Sans for reading, Fira Code for technical text and the chrome, one ice-blue accent), and `tokens.css` holds its tokens, which `src/styles.css` imports. Change the system there rather than on one screen.

## Layout

- `src/api.ts`: the only import from gaidin, types only, and the requests. `PROTOCOL` fails `tsc` when gaidin raises its protocol version, and the app says so when the gaidin it talks to speaks another.
- `src/queries.ts`: gaidin's GETs as TanStack Query queries; the event stream (`src/conversation/stream.ts`) invalidates the ones its events affect.
- `src/transcript.ts`: a conversation rebuilt from its event stream, from gaidin's `web/transcript.ts`.
- `src/conversation/`: the log, the dock (every agent's approvals and questions), the prompt with its commands, and the status line, as gaidin's console has them.
- `src/sidebar.tsx`: the rail of agents, with System at its foot, and beside it the agent's column: its pages as tabs, New thread, a search, the home conversation and its threads, job runs and conversations from other agents by day, loaded as it scrolls; or System's pages across agents. The column collapses to the rail; on a phone the whole sidebar is a drawer.
- `src/frame.tsx`: the sidebar beside the column, for an agent's routes and, with the agent shown last, for the pages across agents; whether the sidebar's column is collapsed (kept on the device, Ctrl+B); the notice that gaidin can't be reached and the app's icon badge, the number of requests waiting.
- `src/swipe.ts`: on a phone, the sidebar follows a swipe, right to open it and left to close it.
- `src/pages/`: the pages beside the conversations, built from `page.tsx` (the frame with the dock, section heads, actions that show what went wrong, and a second press to confirm). Each agent's `schedule.tsx`, `memory.tsx`, `skills.tsx` and `settings.tsx`, and across agents `agents.tsx` and `activity.tsx`. The roster forms use TanStack Form.
- `src/attachments.ts`: files going with a message, sent to gaidin as they're added (an image over 3.75 MB made smaller first), shown as chips in the composer.
- `src/viewport.ts`: keeps the app's box on the visible area, so on a phone the composer sits on the keyboard and comes back to the bottom when it closes, which `100dvh` doesn't do on iOS.
- `src/offline.ts`: whether what's shown came from the service worker's kept answers, and each conversation's last transcript, kept for when its stream can't connect.
- `src/push.ts`: notifications for this device, through gaidin's service worker at `/sw.js` until the switch moves it here.
- `public/sw.js`: the service worker, at `/sw.js` with the scope `/`, where the web view's was, so devices signed up for notifications stay signed up. It shows them, opens the conversation one came from and refreshes the icon badge. It keeps the app on the device: the shell, the build's files from `precache.json`, and the API's last answers, so the app opens at once and still shows what it last had when gaidin can't be reached, and a short page saying so when nothing's kept yet.
- `src/routes/`: `/<agent>` (home; `?draft=` starts the prompt with a request), `/<agent>/t/<id>` (a thread), `/<agent>/new` (a thread about to start), `/<agent>/schedule`, `/<agent>/memory`, `/<agent>/skills[/<name>[/<file>]]` (`?create` for a file being added), `/<agent>/settings`, `/agents` and `/activity`. The web view's `#/<page>` and `#/history/<id>` addresses open the matching page or thread, and gaidin sends the app's old `/app/...` addresses to the new ones. An agent can't have the id `agents`, `activity` or `app`.

## Status

The plan's design for the app is built: the conversations, every page, attachments, Slack mirroring (in gaidin), and the switch, which made it gaidin's interface at `/` in place of the web view. Pages ask for the approvals every 5 seconds, since no conversation's event stream is open on them.

## Deploying

`pnpm ship` asks the VM's gaidin which protocol it speaks and stops unless it's this build's (deploy gaidin first: push, then `setup.sh` on the VM), builds, and copies `dist/client` to `/var/lib/gaidin/moiraine` over Tailscale SSH: built files first, keeping older ones for two weeks, then the shell. gaidin needs `"app": "/var/lib/gaidin/moiraine"` in the `web` section of `/etc/gaidin/config.json` and a restart once; the script says so when it's missing, and doesn't edit the settings itself.
