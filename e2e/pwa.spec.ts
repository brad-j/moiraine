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
	await expect(page.locator("#statusline .status")).not.toHaveText("reconnecting");
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
