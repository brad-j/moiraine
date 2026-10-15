import { resolve } from "node:path";
import { test as base } from "@playwright/test";
import { startGaidin, USER } from "../scripts/gaidin.ts";

export { expect } from "@playwright/test";

/**
 * Each test gets its own gaidin and data directory, serving this build, and a browser signed in as the owner
 * the way tailscale serve does it. A test fails if the page breaks its Content-Security-Policy or throws, which is
 * how a shell that doesn't match the app's first render shows up.
 */
export const test = base.extend<{ server: string }>({
	// oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern, and this one has none
	server: async ({}, use) => {
		const gaidin = await startGaidin(resolve(import.meta.dirname, "../dist/client"));
		await use(gaidin.base);
		await gaidin.stop();
	},
	context: async ({ browser, server }, use) => {
		const context = await browser.newContext({ baseURL: server, extraHTTPHeaders: { "Tailscale-User-Login": USER }, serviceWorkers: "block" });
		await use(context);
		await context.close();
	},
	page: async ({ page }, use) => {
		const violations: string[] = [];
		const thrown: string[] = [];
		page.on("pageerror", (error) => thrown.push(error.message));
		page.on("console", (message) => {
			// frame-ancestors refusals are another page framing this one, which a test does on purpose.
			if (message.text().includes("Content Security Policy") && !message.text().includes("frame-ancestors")) violations.push(message.text());
		});
		await use(page);
		if (violations.length > 0) throw new Error(`The page broke its Content-Security-Policy:\n${violations.join("\n")}`);
		if (thrown.length > 0) throw new Error(`The page threw:\n${thrown.join("\n")}`);
	},
});
