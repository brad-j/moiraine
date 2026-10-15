// The app's service worker, served as /sw.js with the scope /, where gaidin's web view kept it, so the devices that
// signed up for notifications there stay signed up. It shows gaidin's notifications (gaidin's src/push.ts), opens the
// conversation one came from when it's tapped, and answers with a short page when gaidin can't be reached, such as
// from a phone off the tailnet. It caches nothing; everything else goes to the network as usual.
//
// The offline page can't load the app's stylesheet, so it carries its own copy of the design's tokens (tokens.css):
// the canvas, a raised button, ink and the humanist sans.

const OFFLINE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark"><title>gaidin</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-content:center;gap:12px;padding:24px;background:oklch(14.5% 0 0);color:oklch(94% 0 0);
font:16px/1.5 "Fira Sans",Ubuntu,"Noto Sans","Open Sans",sans-serif;text-align:center}p{margin:0;color:oklch(77% 0 0)}
button{justify-self:center;padding:8px 16px;border:1px solid oklch(32% 0 0);border-radius:6px;background:oklch(17.5% 0 0);color:inherit;font:inherit;cursor:pointer}</style></head>
<body><strong>gaidin can't be reached</strong><p>Check that this device is on the tailnet.</p><button onclick="location.reload()">Try again</button></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
	let message = {};
	try {
		message = event.data?.json() ?? {};
	} catch {}
	// Every push shows a notification: browsers stop delivering to apps that don't.
	event.waitUntil(
		self.registration.showNotification(message.title ?? "gaidin", {
			body: message.body ?? "",
			tag: message.tag,
			icon: "/icon-192.png",
			data: { url: message.url ?? "/" },
		}),
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

self.addEventListener("fetch", (event) => {
	if (event.request.mode !== "navigate") return;
	event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
