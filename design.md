# Design: moiraine

The locked design system for the app. Every screen reads this file before its styles change; extend or amend it
when the system needs to grow, rather than overriding it on one page. The tokens are in `tokens.css`.

## Genre

Modern-minimal, dark: a calm tool for talking to agents and answering what they ask. Clean and cool rather than
terminal-styled. Brad is the only user, on a computer and a phone.

## Macrostructure family

- App pages (conversations): sidebar + centered reading column + composer docked at the bottom. The conversation is
  the page; nothing decorates it.
- App pages (step 3: schedule, memory, skills, settings, agents, activity; later connectors and browser): the same sidebar, a header naming the
  page, and a single centered column of rows separated by hairlines. No cards that repeat what's on the page, no
  stat strips.
- The browser's take-over page: the same frame with a wider column (up to 1320 pixels), an address bar with Back, Go
  and Done above the live view, which keeps the page's 16:10 shape on `--color-paper-2` with a hairline and
  `--radius-md`, and a line under it saying the agents wait. A hand-over in the dock is a question's accent card, its
  Take over link styled as the primary button.

## Theme

- Neutral greys with no tint, so nothing reads as slate or blue. Canvas `--color-paper` oklch(14.5% 0 0); raised panels `--color-paper-2` (sidebar, composer, approval
  cards); fills `--color-paper-3` (your messages, hover); current `--color-paper-4`.
- Ink in three steps: `--color-ink` (reading), `--color-ink-2` (secondary), `--color-ink-3` (meta).
- One accent, ice blue `--color-accent` oklch(80% 0.11 225): live state (running), the current item, focus rings,
  the primary button. Kept to small surfaces.
- Status colors, used only for status: `--color-ok` (a tool call that worked), `--color-warn` (waiting on you,
  near a limit), `--color-bad` (errors, deny).
- One faint neutral light, `--color-glow`, at the top of the conversation column. Nothing else is decorative.

## Typography

- Body and interface: Fira Sans 400, 500 for labels and buttons, 600 for titles. Humanist, served from the app.
- Mono: Fira Code, only for technical text: tool names and arguments, code, model ids, timestamps, key hints.
- Headings are small (1rem to 1.125rem). No display type in the app.
- Prose in answers: `--text-md` at line-height 1.65, measure ~72ch.

## Icons and avatars

- Icons are Phosphor (`@phosphor-icons/react`), regular weight, 16 pixels, in the color of the text beside them (the root's
  IconContext). Every icon sits beside a word that says the same; none stands alone except the menu, attach and
  remove buttons, which have labels for screen readers. Fill weight only for Send and Stop.
- An agent's avatar is a rounded square (28% corners): its picture, from its settings page, or its initial on the
  accent's wash. Sizes: 16 in a tag, 20 in the dock and above its answers, 24 in headers, 36 in the sidebar, 40 on the
  agents page, 72 on its settings.
- The sidebar is the agents as a list: a search and a new-thread button above; each agent its avatar, name and when it
  was last active, then its newest message on one line, or a pulsing dot and "working…", with an amber count of what
  waits on the owner. The agent shown has the current background and opens to its newest five threads, indented on a
  hairline, then "show all". The pages are at the foot. No decorative imagery.
- An agent's picture may carry a color of its own where it means something, brown included (Verin's Brown Ajah). Never
  the Claude look: no terracotta, coral or clay accent, and no cream, beige or warm-paper ground. The app's own palette
  stays the neutral greys and ice blue.
- Each of the agent's answers opens with its avatar and name, once per answer.

## Spacing

4-point named scale (`--space-*` in `tokens.css`). Pages use named tokens, never raw values.

## Shape

- Corners: `--radius-sm` 6px (buttons, chips, rows), `--radius-md` 8px (messages, menus), `--radius-lg` 12px
  (composer, approval cards). Pills only for small status chips.
- Borders are hairlines (`--rule-hair`) in `--color-rule`; raised panels add `--color-rule-2`. One soft shadow,
  for things that float over content (the command menu, the drawer).

## Motion

- `--ease-out` for everything; 120ms for color, 200ms for the drawer.
- The only looping animation is the running pulse on a live status dot. Reduced motion stops it and makes the
  drawer appear without sliding.

## Microinteractions stance

- Silent success: a saved setting shows in the status chips, not a toast.
- Keyboard first: Enter sends, Alt+Y/A/N answer the oldest approval, Esc stops a run; buttons show their keys as
  `kbd` hints on pointer devices only.
- Focus rings show instantly, 2px in `--color-focus`.

## Button voice

- Primary: accent fill, accent-ink text, `--radius-sm`, 500 weight ("Send", "Allow once").
- Secondary: transparent with a `--color-rule-2` border.
- Danger: transparent, `--color-bad` text, bad-wash on hover ("Deny").
- Quiet: text-only, ink-3, fill on hover (status chips, snooze).

## What screens must share

- The sidebar, its agent switcher (initial badge + name) and its thread rows.
- The composer and dock at the bottom of every conversation; the dock on every page.
- The accent and its placement; the fonts; the button voice.

## What screens may differ on

- The column's content: a conversation, or a page of rows.
- Header actions on pages (step 3).
