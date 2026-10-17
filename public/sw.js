// The app's service worker, served as /sw.js with the scope /, where gaidin's web view kept it, so the devices that
// signed up for notifications there stay signed up. It shows gaidin's notifications (gaidin's src/push.ts), opens the
// conversation one came from when it's tapped, and keeps the app's icon badge on the number of requests waiting.
//
// It also keeps the app on the device, so it opens at once and still shows something when gaidin can't be reached,
// such as from a phone off the tailnet:
// - The shell (any address that isn't the API or a file) comes from the network, or from the last one kept when the
//   network fails, answers 5xx (tailscale serve while gaidin restarts), or takes longer than SLOW_MS.
// - Built files under /assets/ have hashed names, so a kept one is used as it is. A new shell is kept only once its
//   build's files are all in, from the list the build writes (/precache.json); then the others go,
//   and the open pages are told (a message of type shell-changed) so they can offer a reload.
// - The API's GETs come from the network, or from the last answer kept when it fails, marked with SAVED_AT so the app
//   says it's showing what was saved. The event streams and POSTs pass through.
// - With nothing kept yet, a short page says gaidin can't be reached.
//
// The offline page can't load the app's stylesheet, so it carries its own copy of the design's tokens (tokens.css):
// the canvas, a raised button, ink and the humanist sans.

const SHELL = "moiraine-shell";
const ASSETS = "moiraine-assets";
const SAVED = "moiraine-api";
/** The key the shell is kept under; gaidin serves the same one for every address the app has. */
const SHELL_KEY = "/";
/** How long a page waits for the network before the kept shell is used. */
const SLOW_MS = 3000;
/** The header on an answer from SAVED, with when it was kept in ms. */
const SAVED_AT = "X-Moiraine-Saved-At";
/** How many of the API's answers are kept; the oldest go first. */
const MAX_SAVED = 300;

const OFFLINE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>moiraine</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-content:center;gap:12px;padding:24px;background:oklch(21% 0 0);color:oklch(94% 0 0);
font:16px/1.5 "Fira Sans",Ubuntu,"Noto Sans","Open Sans",sans-serif;text-align:center}p{margin:0;color:oklch(77% 0 0)}
button{justify-self:center;padding:8px 16px;border:1px solid oklch(36% 0 0);border-radius:6px;background:oklch(26.5% 0 0);color:inherit;font:inherit;cursor:pointer}</style></head>
<body><strong>gaidin can't be reached</strong><p>Check that this device is on the tailnet.</p><button onclick="location.reload()">Try again</button></body></html>`;
const offline = () => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } });

self.addEventListener("install", (event) => {
	self.skipWaiting();
	// Kept now, so the app opens offline after its first visit rather than its second.
	event.waitUntil(fetch(SHELL_KEY).then(keepShell).catch(() => undefined));
});
self.addEventListener("activate", (event) =>
	event.waitUntil(
		(async () => {
			const ours = [SHELL, ASSETS, SAVED];
			for (const name of await caches.keys()) if (!ours.includes(name)) await caches.delete(name);
			await self.clients.claim();
		})(),
	),
);

self.addEventListener("fetch", (event) => {
	const { request } = event;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin || request.method !== "GET") return;
	const api = url.pathname.startsWith("/api/") || url.pathname === "/events";
	if (request.mode === "navigate") {
		// The API's own pages, such as a connector's sign-in coming back, are never the shell.
		if (api) return event.respondWith(fetch(request).catch(offline));
		const network = fetch(request);
		// Copied as soon as it comes, before the page starts reading it, or keepShell finds the body used.
		event.waitUntil(network.then((response) => keepShell(response.clone(), event.resultingClientId)).catch(() => undefined));
		return event.respondWith(page(network));
	}
	if (url.pathname.startsWith("/assets/")) return event.respondWith(kept(request));
	if (api && !url.pathname.endsWith("/live") && url.pathname !== "/events" && request.headers.get("Accept") !== "text/event-stream") event.respondWith(saved(request));
});

/** The page: the network's, unless it fails or is slow and there's a kept shell. */
async function page(network) {
	const shell = await (await caches.open(SHELL)).match(SHELL_KEY);
	if (shell === undefined) return network.catch(offline);
	const answered = network.then(
		(response) => (response.status >= 500 ? shell : response),
		() => shell,
	);
	return Promise.race([answered, new Promise((resolve) => setTimeout(resolve, SLOW_MS, shell))]);
}

/** Keeps `response` when it's the shell, and when it's changed, once its build's files are all kept. The page `except` is loading it, so it is already on the new build. */
async function keepShell(response, except) {
	const type = response.headers.get("Content-Type") ?? "";
	if (!response.ok || response.type !== "basic" || response.redirected || !type.startsWith("text/html")) return;
	const cache = await caches.open(SHELL);
	const before = await cache.match(SHELL_KEY);
	const text = await response.clone().text();
	const changed = before !== undefined && (await before.text()) !== text;
	if (before !== undefined && !changed && (await (await caches.open(ASSETS)).keys()).length > 0) return;
	// The files first: a shell is kept only when everything it loads is, so the one kept before stays whole if the
	// network drops partway.
	const files = await keepBuild(text);
	if (files === undefined) return;
	await cache.put(SHELL_KEY, response);
	// Only now do the previous build's files go.
	const assets = await caches.open(ASSETS);
	for (const request of await assets.keys()) if (!files.has(new URL(request.url).pathname)) await assets.delete(request);
	// The open pages run the previous build, so they're told, to offer a reload.
	if (changed) for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) if (client.id !== except) client.postMessage({ type: "shell-changed" });
}

/** The build's files, from its list, the missing ones fetched; the list, or undefined if `shell` or a fetch doesn't fit it. */
async function keepBuild(shell) {
	const listed = await fetch("/precache.json", { cache: "no-store" });
	if (!listed.ok) return undefined;
	const files = new Set(await listed.json());
	// A deploy between the two fetches pairs a shell with another build's list; the shell's own files must be in it.
	for (const file of shell.match(/\/assets\/[^"'\s<>()\\]+/g) ?? []) if (!files.has(file)) return undefined;
	const cache = await caches.open(ASSETS);
	const have = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
	const fetched = await Promise.all(
		[...files].filter((file) => !have.has(file)).map((file) => cache.add(file).then(() => true, () => false)),
	);
	return fetched.every(Boolean) ? files : undefined;
}

/** A built file, kept for good once fetched: a new build names new files. */
async function kept(request) {
	const cache = await caches.open(ASSETS);
	const hit = await cache.match(request);
	if (hit !== undefined) return hit;
	const response = await fetch(request);
	if (response.ok) await cache.put(request, response.clone());
	return response;
}

/** An API GET from the network, kept; or when gaidin can't be reached, the last one kept, marked as such. */
async function saved(request) {
	const cache = await caches.open(SAVED);
	let response;
	try {
		response = await fetch(request);
	} catch (error) {
		const hit = await cache.match(request);
		if (hit === undefined) throw error;
		return hit;
	}
	if (response.ok) {
		const headers = new Headers(response.headers);
		headers.set(SAVED_AT, String(Date.now()));
		const copy = new Response(await response.clone().blob(), { status: response.status, statusText: response.statusText, headers });
		// Put last, so the keys run oldest first.
		await cache.delete(request);
		await cache.put(request, copy);
		const keys = await cache.keys();
		for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SAVED))) await cache.delete(old);
		return response;
	}
	if (response.status >= 502 && response.status <= 504) return (await cache.match(request)) ?? response;
	return response;
}

/** The app's icon shows how many requests wait on the owner; asked of gaidin, since a push says only what it's about. */
async function badge() {
	if (!("setAppBadge" in self.navigator)) return;
	const response = await fetch("/api/approvals", { cache: "no-store" });
	if (!response.ok) return;
	const waiting = (await response.json()).length;
	await (waiting > 0 ? self.navigator.setAppBadge(waiting) : self.navigator.clearAppBadge());
}

self.addEventListener("push", (event) => {
	let message = {};
	try {
		message = event.data?.json() ?? {};
	} catch {}
	// Every push shows a notification: browsers stop delivering to apps that don't.
	event.waitUntil(
		Promise.all([
			self.registration.showNotification(message.title ?? "gaidin", {
				body: message.body ?? "",
				tag: message.tag,
				icon: "/icon-192.png",
				data: { url: message.url ?? "/" },
			}),
			badge().catch(() => undefined),
		]),
	);
});

// The conversation it came from: in the app's window when one is open, or a new one.
self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = new URL(event.notification.data?.url ?? "/", self.location.origin).href;
	event.waitUntil(
		(async () => {
			const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
			const client = open.find((c) => new URL(c.url).origin === self.location.origin);
			if (client === undefined) return void (await self.clients.openWindow(url));
			const focused = await client.focus();
			if (focused.url !== url && "navigate" in focused) await focused.navigate(url).catch(() => undefined);
		})(),
	);
});
