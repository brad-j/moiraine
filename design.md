# Design: moiraine

The locked design system for the app. Every screen reads this file before its styles change; extend or amend it
when the system needs to grow, rather than overriding it on one page. The tokens are in `tokens.css`.

## Genre

Modern-minimal, dark, console-like: a calm tool for talking to agents and answering what they ask, clean and sharp,
with a chat client's log rather than chat bubbles. Brad is the only user, on a computer and a phone. Chosen on
2026-10-16 from four directions as C, "gutter".

## Macrostructure family

- App pages (conversations): sidebar + log against it, left-aligned + composer docked at the bottom. The conversation is the page;
  nothing decorates it.
- The log has a gutter, as an IRC client's does: the time an exchange started (mono, `--gutter-time`), then who wrote
  the line (mono, right-aligned, `--gutter-who`): `you`, the agent's name in the accent, a tool call by the tool's
  name, `think`, `job`, `error`. The line sits beside a hairline that runs the log's length. The dock and the composer
  sit on the same gutter, so a request reads as the next line and the composer as the owner's, `you ›`. On a phone
  the gutter keeps who and leaves out the time.
- App pages (step 3: schedule, memory, skills, settings, agents, activity; later connectors and browser): the same sidebar, a header naming the
  page, and a single centered column of rows separated by hairlines. No cards that repeat what's on the page, no
  stat strips.
- The browser's take-over page: the same frame with a wider column (up to 1320 pixels), an address bar with Back, Go
  and Done above the live view, which keeps the page's 16:10 shape on `--color-paper-2` with a hairline and
  `--radius-md`, and a line under it saying the agents wait. A hand-over in the dock is a question's accent card, its
  Take over link styled as the primary button.

## Theme

- Neutral greys with no tint, so nothing reads as slate or blue. The agents' rail `--color-paper-0` oklch(9.5% 0 0);
  canvas `--color-paper` oklch(11.5% 0 0); the threads' column and code `--color-paper-2`; fills `--color-paper-3`
  (hover); current `--color-paper-4`.
- Ink in three steps: `--color-ink` (reading), `--color-ink-2` (secondary), `--color-ink-3` (meta).
- One accent, ice blue `--color-accent` oklch(80% 0.11 225): live state (running), the current item, focus rings,
  the primary button. Kept to small surfaces.
- Status colors, used only for status: `--color-ok` (a tool call that worked), `--color-warn` (waiting on you,
  near a limit), `--color-bad` (errors, deny).
- Nothing is decorative.

## Typography

- Body and interface: Fira Sans 400, 500 for labels and buttons, 600 for titles. Humanist, served from the app.
- Mono: Fira Code for technical text and the console's chrome: tool names and arguments, code, model ids, times,
  key hints, the log's gutter, the status line, the thread's origin and the day groups, Send and New thread.
- Headings are small (1rem to 1.125rem). No display type in the app.
- Prose in answers: `--text-md` at line-height 1.65, measure ~72ch.

## Icons and avatars

- Icons are Phosphor (`@phosphor-icons/react`), regular weight, 16 pixels, in the color of the text beside them (the root's
  IconContext). Every icon sits beside a word that says the same; none stands alone except the menu, attach and
  remove buttons, which have labels for screen readers. Fill weight only for Send and Stop.
- Icon-only buttons, each with a label for screen readers: the menu (phone), collapse the sidebar (wider), attach,
  and remove.
- An agent's avatar is a rounded square (28% corners): its picture, from its settings page, or its initial on the
  accent's wash (on the paper's fill in the rail, but for the agent shown). Sizes: 16 in a tag, 20 in the dock, 24 in
  headers, 36 in the rail, 40 on the agents page, 72 on its settings.
- The sidebar is two parts. The rail (`--rail`, 64 pixels, `--color-paper-0`): each agent its avatar and its name in
  small mono below, a pulsing accent dot at the avatar's corner while it works, an amber count of what waits on the
  owner, and when it was last active and its newest message on hover; the agent shown has a 2-pixel accent bar at the
  rail's edge. System is at the rail's foot, with an amber count of connectors to sign in. Beside the rail, the
  column (`--sidebar`, 252 pixels, `--color-paper-2`): the agent's name and job and "+ thread"; its pages (Schedule,
  Memory, Skills, Settings) as tabs, the current one underlined in the accent; a search of its threads; Home, then
  its threads under mono day groups (today, this week, older), each its title, when, and where it began in mono
  (app, Slack, job run in green, from an agent in amber), newest five, then "show all". System puts the pages across
  agents (Agents, Connectors, Rules, Browser, Activity) in the column instead, and a page across agents opens it.
- The column collapses to the rail with the header's button or Ctrl+B (Cmd+B), and stays so on the device. On a phone
  the rail and the column are the drawer and don't collapse. No decorative imagery.
- An agent's picture may carry a color of its own where it means something, brown included (Verin's Brown Ajah). Never
  the Claude look: no terracotta, coral or clay accent, and no cream, beige or warm-paper ground. The app's own palette
  stays the neutral greys and ice blue.
- The agent's name is in the gutter beside each of its lines, in the accent.

## Spacing

4-point named scale (`--space-*` in `tokens.css`). Pages use named tokens, never raw values.

## Shape

- Sharp: `--radius-sm` 4px (buttons, chips, rows), `--radius-md` 6px (menus, code), `--radius-lg` 8px (forms on
  pages). Requests in the dock and the composer have no corners: they're lines. Pills only for counts. A status chip
  (`.tag`) is mono in a hairline box.
- Borders are hairlines (`--rule-hair`) in `--color-rule`; fields add `--color-rule-2`. Focus on the composer turns
  its hairline and its gutter to the accent: no ring, glow or shadow. One soft shadow, for things that float over
  content (the command menu, the drawer).
- A request in the dock: on the warn's wash with a 2-pixel warn bar where the log's hairline runs; a question or a
  hand-over on the accent's.
- A workspace file's read, write or edit adds "Trust <folder> for <agent>" beside "make a rule", a quiet link like it,
  the folder shortened to its last two names after "…/" and given in full in its title. It opens the Rules form
  filled in, where the folder's ancestors are buttons to widen it before saving. The form says in warn text beside its
  buttons when an allow rule lets an agent run any command on a workspace.

## Motion

- `--ease-out` for everything; 120ms for color, 200ms for the drawer.
- The only looping animation is the running pulse on a live status dot. Reduced motion stops it and makes the
  drawer appear without sliding.

## Microinteractions stance

- Silent success: a saved setting shows in the status chips, not a toast.
- On a phone the sidebar follows a finger: swiped right across the conversation it comes out under it, swiped left it
  goes, and let go it settles by how far and how fast it went. Something that scrolls sideways keeps its own swipes.
- When gaidin can't be reached and the app shows what it kept, a warn strip at the top of the column says so and since
  when, in the version notice's style, until gaidin answers again.
- Keyboard first: Enter sends, Alt+Y/A/N answer the oldest approval, Esc stops a run; buttons show their keys as
  `kbd` hints on pointer devices only.
- Focus rings show instantly, 2px in `--color-focus`.

## Button voice

- Primary: accent fill, accent-ink text, `--radius-sm`, 500 weight ("Allow once", "Take over").
- Send: quiet, mono, in the accent, the accent's wash under a pointer ("Send ↵").
- Secondary: transparent with a `--color-rule-2` border.
- Danger: transparent, `--color-bad` text, bad-wash on hover ("Deny").
- Quiet: text-only, ink-3, fill on hover (status chips, snooze).

## What screens must share

- The sidebar: the rail, and the column with the agent's tabs and threads, or System's pages.
- The log's gutter, and the composer and dock on it at the bottom of every conversation; the dock on every page.
- The accent and its placement; the fonts; the button voice.

## What screens may differ on

- The column's content: a conversation, or a page of rows.
- Header actions on pages (step 3).
