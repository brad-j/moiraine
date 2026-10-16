import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

async function send(page: Page, text: string) {
	await page.locator("#message").fill(text);
	await page.locator("#message").press("Enter");
}

test("without the owner's tailnet login the app is refused", async ({ server }) => {
	expect((await fetch(`${server}/`)).status).toBe(403);
	expect((await fetch(`${server}/`, { headers: { "Tailscale-User-Login": "someone@example.com" } })).status).toBe(403);
});

test("another site can't put the app in a frame", async ({ page, server }) => {
	// Another origin, served from loopback too, so Chrome's local network checks don't refuse the frame before the page's headers do.
	const other = createServer((_request, response) => response.end(`<iframe src="${server}/"></iframe>`));
	await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
	try {
		await page.goto(`http://127.0.0.1:${(other.address() as AddressInfo).port}/`, { waitUntil: "load" });
		await expect(page.frameLocator("iframe").locator("#message")).toHaveCount(0);
	} finally {
		other.close();
	}
});

test("the app opens on the default agent's home conversation, where a message is answered", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveURL(/\/gaidin$/);
	await expect(page.locator(".convo-head h1")).toHaveText("gaidin");
	await send(page, "hi");
	await expect(page.locator("#log")).toContainText("Hello, Brad.");
	await page.reload();
	await expect(page.locator("#log")).toContainText("Hello, Brad.");
	// The sidebar sits beside the conversation.
	const sidebar = (await page.locator("#sidebar").boundingBox())!;
	const log = (await page.locator("#scroll").boundingBox())!;
	expect(sidebar.x + sidebar.width).toBeLessThanOrEqual(log.x);
});

test("a fetch waits in the dock until it's allowed, and Deny stops it", async ({ page }) => {
	await page.goto("/");
	const dock = page.locator("#approvals");
	const log = page.locator("#log");
	await send(page, "fetch the page");
	await expect(dock).toContainText("fetch_url");
	await dock.getByRole("button", { name: "Allow once" }).click();
	await expect(log).toContainText("The page says: page text.");
	await expect(dock).toBeEmpty();

	await send(page, "fetch it again");
	await expect(dock).toContainText("fetch_url");
	await dock.getByRole("button", { name: "Deny" }).click();
	await expect(log).toContainText("Brad said no.");
	await expect(dock).toBeEmpty();
});

test("Alt+N denies, Alt+Y allows once and Alt+A allows the host from then on", async ({ page }) => {
	await page.goto("/");
	const dock = page.locator("#approvals");
	const log = page.locator("#log");
	const fetched = log.getByText("The page says: page text.");

	await send(page, "fetch");
	await expect(dock).toContainText("fetch_url");
	await page.keyboard.press("Alt+KeyN");
	await expect(log).toContainText("Brad said no.");

	await send(page, "fetch");
	await expect(dock).toContainText("fetch_url");
	await page.keyboard.press("Alt+KeyY");
	await expect(fetched).toHaveCount(1);

	await send(page, "fetch");
	await expect(dock).toContainText("fetch_url");
	await page.keyboard.press("Alt+KeyA");
	await expect(fetched).toHaveCount(2);

	// Allowed for good: the next fetch doesn't ask.
	await send(page, "fetch");
	await expect(fetched).toHaveCount(3);
	await expect(dock).toBeEmpty();
});

test("a question is answered with its button or in the owner's own words", async ({ page }) => {
	await page.goto("/");
	const dock = page.locator("#approvals");
	await send(page, "ask me");
	await expect(dock).toContainText("Keep the old branch?");
	await dock.getByRole("button", { name: "No" }).click();
	await expect(page.locator("#log")).toContainText("Brad answered: No");

	await send(page, "ask me again");
	await expect(dock).toContainText("Keep the old branch?");
	await send(page, "only if it's merged");
	await expect(page.locator("#log")).toContainText("Brad answered: only if it's merged");
	await expect(dock).toBeEmpty();
});

test("a fired reminder in the log can be snoozed", async ({ page }) => {
	await page.goto("/");
	await send(page, "remind me");
	const snooze = page.getByRole("button", { name: "snooze 10 min" });
	await expect(snooze).toBeVisible({ timeout: 15_000 });
	await snooze.click();
	await expect(page.locator("#log")).toContainText("Snoozed until");
});

test("Esc stops a run, and the log says gaidin will drop the request", async ({ page }) => {
	await page.goto("/");
	await send(page, "ask me something");
	await expect(page.locator("#approvals")).toContainText("Keep the old branch?");
	await page.keyboard.press("Escape");
	const stopped = page.locator("#log .row.stopped");
	await expect(stopped).toHaveText(/Stopped\. gaidin will drop that request unless you ask again\./);
	await expect(stopped).toHaveCount(1);
	await expect(page.locator("#approvals")).toBeEmpty();
});

test("while the server can't be reached, the app's own refreshes don't fill the log with errors", async ({ page }) => {
	await page.goto("/gaidin");
	await expect(page.locator(".convo-head h1")).toHaveText("gaidin");
	// From here the stream never connects and every request fails, as when the server is down behind tailscale serve.
	await page.route("**/events**", (route) => route.abort());
	await page.route("**/api/**", (route) => route.fulfill({ status: 502, body: "" }));
	await page.clock.install();
	await page.reload();
	await expect(page.locator("#statusline .status")).toHaveText("reconnecting");
	await page.clock.runFor(5 * 60_000);
	await expect(page.locator("#log .row.err")).toHaveCount(0);
});

test("commands: /remember adds a shared note, /tool switches a tool off, and Tab completes", async ({ page }) => {
	await page.goto("/");
	await send(page, "/remember the dog is called Bela");
	await expect(page.locator("#log")).toContainText("Noted [1]: the dog is called Bela");

	await page.locator("#message").fill("/tool fet");
	await page.locator("#message").press("Tab");
	await expect(page.locator("#message")).toHaveValue("/tool fetch_url off");
	await page.locator("#message").press("Enter");
	await expect(page.locator("#log")).toContainText("fetch_url off. Applies from the next request.");
	await expect(page.locator("#statusline")).toContainText("fetch_url off");
	await page.reload();
	await expect(page.locator("#statusline")).toContainText("fetch_url off");
});

test("a new thread starts from the app, is listed in the sidebar as the app's, and goes on after a reload", async ({ page }) => {
	await page.goto("/");
	const sidebar = page.getByRole("navigation", { name: "Conversations" });
	await expect(sidebar).toContainText("No threads yet.");
	await sidebar.getByRole("link", { name: "New thread" }).click();
	await expect(page).toHaveURL(/\/gaidin\/new$/);
	await expect(page.locator(".convo-head h1")).toHaveText("New thread");
	await send(page, "plan the garden");
	await expect(page).toHaveURL(/\/gaidin\/t\/\d+$/);
	await expect(page.locator("#log")).toContainText("Hello, Brad.");
	await expect(page.locator(".convo-head h1")).toHaveText("plan the garden");
	const listed = sidebar.locator(".thread", { hasText: "plan the garden" });
	await expect(listed).toContainText("app");
	await expect(listed).toHaveAttribute("aria-current", "page");

	await send(page, "and the shed");
	await expect(page.locator("#log .row.gaidin")).toHaveCount(2);
	await page.reload();
	await expect(page.locator("#log .row.you .b")).toHaveText(["plan the garden", "and the shed"]);
	// The home conversation has none of it.
	await sidebar.locator("li.current > .agent").click();
	await expect(page.locator("#log")).not.toContainText("plan the garden");
});

test("a job run opens from the sidebar, and a message to it goes to a thread forked from it", async ({ page }) => {
	await page.goto("/");
	await send(page, "check the weather soon");
	await page.locator("#approvals").getByRole("button", { name: "Allow once" }).click();
	// The run reports into the home conversation when it's done.
	await expect(page.locator("#log .row.job")).toContainText("Quick weather check", { timeout: 15_000 });

	const sidebar = page.getByRole("navigation", { name: "Conversations" });
	const run = sidebar.locator(".thread", { hasText: "Quick weather check" });
	await expect(run).toContainText("job run");
	await run.click();
	await expect(page).toHaveURL(/\/t\/\d+$/);
	const runUrl = page.url();
	await expect(page.locator(".convo-head .tag")).toHaveText("job run");
	await expect(page.locator("#log .row.prompt")).toContainText("Check the weather once.");
	await expect(page.locator("#log .row.prompt .k")).toHaveText("job");

	await send(page, "and tomorrow?");
	await expect(page).not.toHaveURL(runUrl);
	await expect(page).toHaveURL(/\/t\/\d+$/);
	await expect(page.locator(".convo-head .tag")).toHaveText("app");
	await expect(page.locator(".replying")).toContainText("Hello, Brad.");
	await expect(page.locator("#log > .row.you .b")).toHaveText("and tomorrow?");
	await expect(page.locator("#log > .row.gaidin")).toHaveCount(1);
});

test("the dock shows another agent's request, labeled with that agent, whichever agent is shown", async ({ page }) => {
	const made = await page.request.post("/api/agents/save", { data: { id: "scout", name: "Scout", job: "Looks things up." } });
	expect(made.ok()).toBe(true);
	await page.goto("/");
	const agents = page.getByRole("group", { name: "Agents" });
	await agents.getByRole("link", { name: "Scout" }).click();
	await expect(page).toHaveURL(/\/scout$/);
	await expect(page.locator(".convo-head h1")).toHaveText("Scout");
	// With no messages yet, its place in the rail shows its job.
	await expect(page.locator("#sidebar .agents li.current > .agent")).toHaveAttribute("title", "Scout: Looks things up.");

	await send(page, "fetch the page");
	const dock = page.locator("#approvals");
	await expect(dock).toContainText("fetch_url");
	await agents.getByRole("link", { name: "gaidin" }).click();
	await expect(page).toHaveURL(/\/gaidin$/);
	await expect(dock.locator(".who")).toHaveText("Scout");
	// Scout's row says a request of its is waiting.
	await expect(agents.locator("li", { hasText: "Scout" }).locator(".waiting")).toHaveText("1");
	await expect(agents.locator("li", { hasText: "gaidin" }).locator(".waiting")).toHaveCount(0);
	await dock.getByRole("link", { name: "Scout" }).click();
	await expect(page).toHaveURL(/\/scout$/);
	await dock.getByRole("button", { name: "Allow once" }).click();
	await expect(page.locator("#log")).toContainText("The page says: page text.");
	// gaidin's home has none of Scout's conversation.
	await agents.getByRole("link", { name: "gaidin" }).click();
	await expect(page.locator("#log")).not.toContainText("The page says");
});

test("on a phone the sidebar is a drawer", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	const sidebar = page.getByRole("navigation", { name: "Conversations" });
	await expect(page.locator("#message")).toBeVisible();
	await expect(sidebar).toBeHidden();
	await page.getByRole("button", { name: "Conversations" }).click();
	await expect(sidebar).toBeVisible();
	await sidebar.getByRole("link", { name: "New thread" }).click();
	await expect(page).toHaveURL(/\/new$/);
	await expect(sidebar).toBeHidden();
	await expect(page.locator("#message")).toBeVisible();
});

test("a missing thread or agent says so", async ({ page }) => {
	await page.goto("/gaidin/t/99999");
	await expect(page.locator(".page-problem")).toHaveText("No thread, job run or conversation from another agent 99999");
	await page.goto("/nobody");
	await expect(page.locator(".page-problem")).toHaveText("There's no agent nobody.");
});

test("each agent in the rail says when it was last active and what it last said, or that it's working", async ({ page }) => {
	expect((await page.request.post("/api/agents/save", { data: { id: "scout", name: "Scout", job: "Looks things up." } })).ok()).toBe(true);
	await page.goto("/gaidin");
	const rail = page.getByRole("group", { name: "Agents" });
	const gaidin = rail.locator("li", { hasText: "gaidin" }).locator(".agent");
	await expect(rail.locator("li .name")).toHaveText(["gaidin", "Scout"]);
	await send(page, "hi");
	await expect(gaidin).toHaveAttribute("title", /^gaidin: \d{2}:\d{2} · Hello, Brad\.$/);
	await expect(rail.locator("li", { hasText: "Scout" }).locator(".agent")).toHaveAttribute("title", "Scout: Looks things up.");

	// A question keeps the run going, so the rail says it's working until it's answered.
	await send(page, "ask me");
	await expect(gaidin.locator(".live")).toHaveText("working");
	await expect(gaidin).toHaveAttribute("title", "gaidin: working…");
	await expect(page.locator("#approvals")).toContainText("Keep the old branch?");
});

test("many requests waiting take at most 40% of the window and scroll, and under a page line up with its column", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/gaidin/new");
	// Each new thread's fetch waits on the owner.
	for (let n = 0; n < 4; n++) {
		const started = await page.request.post("/api/threads/start", { data: { content: `fetch the page ${n}`, requestId: `many-${n}`, agent: "gaidin" } });
		expect(started.ok()).toBe(true);
	}
	const cards = page.locator("#approvals .approval");
	// With the suite's other servers busy, four runs can take a while to reach their requests.
	await expect(cards).toHaveCount(4, { timeout: 15_000 });
	const approvals = page.locator("#approvals");
	expect((await approvals.boundingBox())!.height).toBeLessThanOrEqual(800 * 0.4 + 1);
	expect(await approvals.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

	await cards.first().getByRole("link", { name: "make a rule" }).click();
	await expect(page.locator(".rule-form")).toBeInViewport();
	expect((await page.locator(".page-scroll").boundingBox())!.height).toBeGreaterThan(800 * 0.4);
	expect((await cards.first().boundingBox())!.x).toBe((await page.locator(".page > section").first().boundingBox())!.x);
});

test("the sidebar's column collapses to the rail and stays so, from its button or Ctrl+B", async ({ page }) => {
	await page.goto("/gaidin");
	const column = page.locator("#sidebar-column");
	await expect(column).toBeVisible();
	await page.getByRole("button", { name: "Hide the sidebar" }).click();
	await expect(column).toBeHidden();
	await expect(page.getByRole("group", { name: "Agents" })).toBeVisible();
	await page.reload();
	await expect(column).toBeHidden();
	await page.locator("#message").press("Control+b");
	await expect(column).toBeVisible();
	await expect(page.getByRole("button", { name: "Hide the sidebar" })).toBeVisible();
	await expect(page.locator("#message")).toBeFocused();
});

test("the agent shown opens to its newest threads, and the search narrows them too", async ({ page }) => {
	await page.goto("/gaidin");
	for (const title of ["plan the garden", "fix the shed"]) {
		await page.getByRole("link", { name: "New thread" }).click();
		await expect(page.locator(".convo-head h1")).toHaveText("New thread");
		await send(page, title);
		await expect(page.locator("#log")).toContainText("Hello, Brad.");
	}
	const threads = page.locator("#sidebar .threads .thread");
	await expect(threads).toHaveCount(2);
	await expect(page.locator("#sidebar .threads .day")).toHaveText(["today"]);
	await page.getByRole("searchbox", { name: "Search threads" }).fill("garden");
	await expect(threads).toHaveCount(1);
	await expect(threads).toContainText("plan the garden");
});

/** How far the log is from its end, in pixels. */
const fromEnd = (page: Page) => page.locator("#scroll").evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

test("the log stays at its end when the dock grows under it, and after a reload", async ({ page }) => {
	await page.goto("/");
	await send(page, "markdown");
	await send(page, "markdown");
	await expect(page.locator("#log .row").last()).toBeVisible();
	await expect.poll(() => fromEnd(page)).toBeLessThan(2);

	// A request's card in the dock takes height from the log.
	await send(page, "fetch the page");
	await expect(page.locator("#approvals .approval")).toBeVisible();
	await expect.poll(() => fromEnd(page)).toBeLessThan(2);
	await page.locator("#approvals").getByRole("button", { name: "Allow once" }).click();
	await expect(page.locator("#log")).toContainText("The page says: page text.");
	await expect.poll(() => fromEnd(page)).toBeLessThan(2);

	await page.reload();
	await expect(page.locator("#log")).toContainText("The page says: page text.");
	await expect.poll(() => fromEnd(page)).toBeLessThan(2);

	// Scrolled up, the answer doesn't move it; the jump button offers the end instead.
	await send(page, "fetch the page");
	await expect(page.locator("#approvals .approval")).toBeVisible();
	await page.locator("#scroll").evaluate((el) => (el.scrollTop = 0));
	await page.locator("#approvals").getByRole("button", { name: "Allow once" }).click();
	await expect(page.locator("#log .row").last()).toContainText("The page says: page text.");
	await expect(page.getByRole("button", { name: "new activity" })).toBeVisible();
	expect(await page.locator("#scroll").evaluate((el) => el.scrollTop)).toBeLessThan(2);
	await page.getByRole("button", { name: "new activity" }).click();
	await expect.poll(() => fromEnd(page)).toBeLessThan(2);
});

test("after gaidin restarts, an open conversation reconnects and catches up, though tailscale serve answered 502 meanwhile", async ({ page }) => {
	let calls = 0;
	await page.route("**/events**", async (route) => {
		calls += 1;
		// The first stream ends, as when gaidin stops; then two tries get 502 while it starts again.
		if (calls === 1) return route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: "retry: 100\n\n" });
		if (calls <= 3) return route.fulfill({ status: 502, body: "" });
		return route.continue();
	});
	await page.goto("/gaidin");
	await expect.poll(() => calls).toBeGreaterThanOrEqual(3);
	// A message sent elsewhere while the page was cut off, as from Slack or the CLI.
	expect((await page.request.post("/api/message", { data: { content: "hello from elsewhere" } })).ok()).toBe(true);
	await expect(page.locator("#log")).toContainText("hello from elsewhere");
	await expect(page.locator("#log")).toContainText("Hello, Brad.");
	await expect(page.locator("#statusline")).not.toContainText("reconnecting");
});

test("back from the background, a conversation's stream is opened again at once rather than after its retry", async ({ page }) => {
	let calls = 0;
	await page.route("**/events**", async (route) => {
		calls += 1;
		// The first stream ends with a retry far off, as one suspended in the background can be left waiting.
		if (calls === 1) return route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: "retry: 600000\n\n" });
		return route.continue();
	});
	await page.goto("/gaidin");
	await expect(page.locator("#statusline .status")).toHaveText("reconnecting");
	const visibility = (state: string) =>
		page.evaluate((to) => {
			Object.defineProperty(document, "visibilityState", { configurable: true, get: () => to });
			document.dispatchEvent(new Event("visibilitychange"));
		}, state);
	await visibility("hidden");
	await visibility("visible");
	await expect(page.locator("#statusline")).not.toContainText("reconnecting");
	expect(calls).toBe(2);
});

test("the app is the visible area: with a keyboard up the composer sits on it, without the home bar's inset, and back at the bottom after", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/gaidin");
	const prompt = page.locator("#prompt");
	const bottom = async () => {
		const box = await prompt.boundingBox();
		return box === null ? 0 : box.y + box.height;
	};
	await expect(prompt).toBeVisible();
	const resting = await bottom();
	expect(resting).toBeGreaterThan(780);
	// What a keyboard leaves visible.
	await page.setViewportSize({ width: 390, height: 500 });
	await expect(page.locator("html")).toHaveClass(/keyboard/);
	await expect.poll(bottom).toBeLessThanOrEqual(500);
	await expect.poll(bottom).toBeGreaterThan(470);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator("html")).not.toHaveClass(/keyboard/);
	await expect.poll(bottom).toBe(resting);
});
