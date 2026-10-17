import { devices, type Page } from "@playwright/test";
import { USER } from "../scripts/gaidin.ts";
import { expect, system, test } from "./fixtures.ts";

async function send(page: Page, text: string) {
	await page.locator("#message").fill(text);
	await page.locator("#message").press("Enter");
}

const frames = async (page: Page) => Number((await page.locator(".live canvas").getAttribute("data-frames")) ?? 0);

test("an agent hands the browser over; the owner takes it over from the dock, types into the page, and is done", async ({ page }) => {
	expect((await page.request.post("/api/agents/save", { data: { id: "gaidin", profiles: ["personal"] } })).ok()).toBe(true);
	await page.goto("/");
	await (await system(page)).getByRole("link", { name: "Browser" }).click();
	await expect(page).toHaveURL(/\/browser$/);
	await expect(page.locator(".profile-row")).toContainText("personal");
	await expect(page.locator(".profile-row")).toContainText("/form by gaidin");

	await page.locator("#sidebar .agents li.current > .agent").click();
	await send(page, "hand over the browser");
	const card = page.locator("#approvals .approval.handover");
	await expect(card).toContainText("asks you to take over");
	await expect(card).toContainText("Sign in to site.test");
	await card.getByRole("link", { name: "Take over" }).click();

	await expect(page).toHaveURL(/\/browser\/personal$/);
	await expect(page.locator(".convo-head h1")).toHaveText("Browser · personal");
	await expect.poll(() => frames(page)).toBeGreaterThan(0);
	await expect(page.getByRole("textbox", { name: "Address" })).toHaveValue(/site\.test:\d+\/form$/);
	await expect(page.locator(".page-note")).toContainText("the agents' browser calls on it wait until you press Done");

	// The page's field is in its top left corner.
	await page.locator(".live canvas").click({ position: { x: 8, y: 8 } });
	const before = await frames(page);
	await page.keyboard.type("brad");
	await expect.poll(() => frames(page)).toBeGreaterThan(before);
	await page.getByRole("main").getByRole("button", { name: "Done" }).click();
	await expect(page.locator(".live-released")).toContainText("Released: you're done. The agents can use personal again.");
	await expect(page.locator("#approvals")).toBeEmpty();

	await page.locator("#sidebar .agents li.current > .agent").click();
	await expect(page.locator("#log")).toContainText('Back from the browser: - textbox "Name" [active] [ref=e2]: brad');
});

test("on a phone, a tap clicks the page and the Keyboard button types and deletes", async ({ browser, server }) => {
	const phone = await browser.newContext({ ...devices["Pixel 7"], baseURL: server, extraHTTPHeaders: { "Tailscale-User-Login": USER }, serviceWorkers: "block" });
	const page = await phone.newPage();
	expect((await page.request.post("/api/agents/save", { data: { id: "gaidin", profiles: ["personal"] } })).ok()).toBe(true);
	await page.goto("/gaidin");
	await send(page, "hand over the browser");
	await page.locator("#approvals").getByRole("link", { name: "Take over" }).click();
	await expect.poll(() => frames(page)).toBeGreaterThan(0);

	await page.locator(".live canvas").tap({ position: { x: 4, y: 4 } });
	await page.getByRole("button", { name: "Keyboard" }).click();
	const before = await frames(page);
	await page.keyboard.type("bradd");
	await page.keyboard.press("Backspace");
	await expect.poll(() => frames(page)).toBeGreaterThan(before);
	await page.getByRole("main").getByRole("button", { name: "Done" }).click();
	await expect(page.locator(".live-released")).toContainText("Released: you're done.");
	await page.goto("/gaidin");
	await expect(page.locator("#log")).toContainText(/Back from the browser: - textbox "Name" (\[active\] )?\[ref=e2\]: brad"?$/m);
	await phone.close();
});
