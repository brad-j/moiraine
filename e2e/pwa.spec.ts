import type { Page } from "@playwright/test";
import { USER } from "../scripts/gaidin.ts";
import { expect, test } from "./fixtures.ts";

async function send(page: Page, text: string) {
	await page.locator("#message").fill(text);
	await page.locator("#message").press("Enter");
}

test("the app's icon badge counts the requests waiting on the owner, and clears when they're answered", async ({ page }) => {
	// A browser shows the badge only for an installed app, so the calls are recorded instead.
	await page.addInitScript(() => {
		const calls: (number | null)[] = [];
		Object.assign(window, { badgeCalls: calls });
		Object.assign(navigator, {
			setAppBadge: async (count: number) => void calls.push(count),
			clearAppBadge: async () => void calls.push(null),
		});
	});
	const last = () => page.evaluate(() => (window as unknown as { badgeCalls: (number | null)[] }).badgeCalls.at(-1));
	await page.goto("/gaidin");
	await expect.poll(last).toBeNull();
	await send(page, "fetch the page");
	await expect(page.locator("#approvals")).toContainText("fetch_url");
	await expect.poll(last).toBe(1);
	await page.locator("#approvals").getByRole("button", { name: "Allow once" }).click();
	await expect.poll(last).toBeNull();
});

test("with gaidin out of reach the app still opens, from what the service worker kept, and says so", async ({ browser, server }) => {
	const context = await browser.newContext({ baseURL: server });
	// As tailscale serve does, the login goes on every request, the worker's own included.
	await context.route("**/*", (route) => route.continue({ headers: { ...route.request().headers(), "tailscale-user-login": USER } }));
	const page = await context.newPage();
	await page.goto("/gaidin");
	await send(page, "hi");
	await expect(page.locator("#log")).toContainText("Hello, Brad.");
	// The worker is in charge, has the build's files, and the conversation is kept.
	await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
	await expect.poll(() => page.evaluate(async () => (await (await caches.open("moiraine-assets")).keys()).length)).toBeGreaterThan(10);
	await expect.poll(() => page.evaluate(async () => (await (await caches.open("moiraine-transcripts")).keys()).length)).toBe(1);
	// Once more, so the API's answers the page needs went through the worker and were kept.
	await page.reload();
	await expect(page.locator("#log")).toContainText("Hello, Brad.");

	await context.setOffline(true);
	await page.reload();
	await expect(page.locator(".saved-notice")).toContainText("gaidin can't be reached, so this is what was here");
	await expect(page.locator(".convo-head h1")).toHaveText("gaidin");
	await expect(page.locator("#log")).toContainText("Hello, Brad.");
	await expect(page.locator("#statusline .status")).toHaveText("reconnecting");

	await context.setOffline(false);
	await expect(page.locator(".saved-notice")).toHaveCount(0);
	await expect(page.locator("#statusline")).not.toContainText("reconnecting");
	await context.close();
});

test("a build whose files didn't all arrive is not kept as the shell, so offline shows the offline page rather than a blank one", async ({ browser, server }) => {
	const context = await browser.newContext({ baseURL: server });
	const headers = { "tailscale-user-login": USER };
	const files: string[] = await (await context.request.get("/precache.json", { headers })).json();
	// A route's script the first page doesn't load, so only the worker's precache asks for it.
	const lazy = files.find((file) => file.includes("memory") && file.endsWith(".js"));
	expect(lazy).toBeDefined();
	await context.route("**/*", (route) =>
		route.request().url().endsWith(lazy ?? "") ? route.abort() : route.continue({ headers: { ...route.request().headers(), ...headers } }),
	);
	const page = await context.newPage();
	await page.goto("/gaidin");
	await expect(page.locator("#message")).toBeVisible();
	await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
	// The rest of the build is in, and the shell that names the missing file is not.
	await expect.poll(() => page.evaluate(async () => (await (await caches.open("moiraine-assets")).keys()).length)).toBeGreaterThan(10);
	expect(await page.evaluate(async () => (await caches.open("moiraine-shell")).match("/").then((r) => r !== undefined))).toBe(false);

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByText("gaidin can't be reached")).toBeVisible();
	await context.close();
});

test("on a phone the sidebar follows a swipe: right across the conversation opens it, left closes it", async ({ browser, server }) => {
	const context = await browser.newContext({
		baseURL: server,
		extraHTTPHeaders: { "Tailscale-User-Login": USER },
		serviceWorkers: "block",
		viewport: { width: 390, height: 844 },
		hasTouch: true,
		isMobile: true,
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	const swipe = async (from: number, to: number, y = 400) => {
		const steps = 8;
		await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
		for (let step = 1; step <= steps; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from + ((to - from) * step) / steps, y }] });
		await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	};
	await page.goto("/gaidin");
	const sidebar = page.getByRole("navigation", { name: "Conversations" });
	await expect(page.locator("#message")).toBeVisible();
	await expect(sidebar).toBeHidden();

	// Too short and too slow to count stays shut.
	await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 40, y: 400 }] });
	await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 60, y: 400 }] });
	await page.waitForTimeout(300);
	await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 70, y: 400 }] });
	await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	await expect(sidebar).toBeHidden();

	await swipe(40, 330);
	await expect(sidebar).toBeVisible();
	await expect(page.locator("#app")).toHaveClass(/drawer-open/);
	await swipe(300, 20);
	await expect(sidebar).toBeHidden();
	// Scrolling the log up and down doesn't open it.
	await swipe(200, 210, 300);
	await expect(sidebar).toBeHidden();
	await context.close();
});

test("an open app asks for gaidin's version again when it's shown again, and says so when the protocol has moved", async ({ page }) => {
	let protocol: number | undefined;
	await page.route("**/api/version", async (route) => {
		const response = await route.fetch();
		const body = await response.json();
		await route.fulfill({ response, json: { ...body, protocol: protocol ?? body.protocol } });
	});
	await page.goto("/gaidin");
	await expect(page.locator("#message")).toBeVisible();
	await expect(page.locator(".version-notice")).toHaveCount(0);
	// gaidin is deployed with a newer protocol while the page stays open; the page is hidden and shown again.
	protocol = 9999;
	await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
	await expect(page.locator(".version-notice")).toContainText("gaidin speaks 9999");
	// And it's seen coming back online.
	protocol = undefined;
	await page.evaluate(() => window.dispatchEvent(new Event("online")));
	await expect(page.locator(".version-notice")).toHaveCount(0);
});

test("a page open on a build the service worker has since replaced offers a reload", async ({ browser, server }) => {
	const context = await browser.newContext({ baseURL: server });
	await context.route("**/*", (route) => route.continue({ headers: { ...route.request().headers(), "tailscale-user-login": USER } }));
	const page = await context.newPage();
	await page.goto("/gaidin");
	await expect(page.locator("#message")).toBeVisible();
	await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
	await expect.poll(() => page.evaluate(async () => (await (await caches.open("moiraine-assets")).keys()).length)).toBeGreaterThan(10);
	await expect.poll(() => page.evaluate(async () => (await caches.open("moiraine-shell")).match("/").then((r) => r !== undefined))).toBe(true);
	await expect(page.getByText("A new version is ready.")).toHaveCount(0);
	// What was kept is made to differ from what gaidin serves, as after a deploy, and another window opens the app.
	await page.evaluate(async () => {
		await (await caches.open("moiraine-shell")).put("/", new Response("<!doctype html><title>old</title>", { headers: { "Content-Type": "text/html" } }));
	});
	const other = await context.newPage();
	await other.goto("/gaidin");
	await expect(page.getByText("A new version is ready.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
	// The window that opened the new build is already on it.
	await expect(other.locator("#message")).toBeVisible();
	await expect(other.getByText("A new version is ready.")).toHaveCount(0);
	await context.close();
});
