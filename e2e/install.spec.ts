import { USER } from "../scripts/gaidin.ts";
import { expect, test } from "./fixtures.ts";

const get = (server: string, path: string, init: RequestInit = {}) => fetch(`${server}${path}`, { ...init, headers: { "Tailscale-User-Login": USER } });

test("the app installs: its manifest, icons and service worker are its own, at the paths the web view had them", async ({ page, server }) => {
	const manifest = await get(server, "/manifest.webmanifest");
	expect(manifest.headers.get("content-type")).toBe("application/manifest+json");
	const body = (await manifest.json()) as { id: string; start_url: string; icons: { src: string }[] };
	// The same id as the web view's, so an installed one stays installed.
	expect([body.id, body.start_url]).toEqual(["/", "/"]);
	for (const path of ["/apple-touch-icon.png", ...body.icons.map((icon) => icon.src)]) {
		const icon = await get(server, path);
		expect(icon.headers.get("content-type"), path).toBe("image/png");
	}
	expect((await get(server, "/favicon.svg")).headers.get("content-type")).toBe("image/svg+xml");
	const worker = await get(server, "/sw.js");
	expect(worker.headers.get("content-type")).toMatch(/^text\/javascript/);
	expect(worker.headers.get("cache-control")).toBe("no-store");
	expect(await worker.text()).toMatch(/addEventListener\("notificationclick"/);

	await page.goto("/");
	await expect(page.locator('head link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
	await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
});

test("the app's old /app/ addresses, and a notification's for an agent's home, open where they should", async ({ page, server }) => {
	await page.goto("/app/gaidin/schedule");
	await expect(page).toHaveURL(/\/gaidin\/schedule$/);
	await expect(page.locator(".convo-head h1")).toHaveText("Schedule");

	// A request from the home conversation names it as /<agent>/t/<id>, as one from a thread does.
	const [gaidin] = (await (await get(server, "/api/agents")).json()) as { id: string; home: number }[];
	await page.goto(`/gaidin/t/${gaidin!.home}`);
	await expect(page).toHaveURL(/\/gaidin$/);
	await expect(page.locator(".convo-head .tag")).toHaveText("home");
});
