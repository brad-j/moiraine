import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

async function send(page: Page, text: string) {
	await page.locator("#message").fill(text);
	await page.locator("#message").press("Enter");
}

test("a rule made from an approval card lets the next call through, and the timeline and rules page say so", async ({ page }) => {
	await page.goto("/gaidin");
	await send(page, "fetch the page");
	const card = page.locator("#approvals .approval");
	await expect(card).toContainText("fetch_url");
	await card.getByRole("link", { name: "make a rule" }).click();

	// The form starts from the request: its tool, its agent, and its URL as a host to match.
	await expect(page).toHaveURL(/\/rules\?/);
	const form = page.locator(".rule-form");
	await expect(form.getByRole("textbox", { name: /^tool/ })).toHaveValue("fetch_url");
	await expect(form.getByRole("combobox", { name: /^agent/ })).toHaveValue("gaidin");
	await expect(form.getByRole("combobox", { name: "How url is matched" })).toHaveValue("host");
	await expect(form.getByRole("textbox", { name: "Value for url" })).toHaveValue("site.test");
	await form.getByRole("checkbox", { name: "Use the condition on url" }).check();
	await form.getByRole("checkbox", { name: /even after outside text/ }).check();
	await form.getByRole("textbox", { name: /^note/ }).fill("the test site");
	await form.getByRole("button", { name: "make rule" }).click();
	const row = page.locator(".rule-row");
	await expect(row).toContainText("allow");
	await expect(row).toContainText("for gaidin");
	await expect(row).toContainText("when url host site.test · even after outside text");
	await expect(row).toContainText("the test site");
	await expect(page.locator(".page")).toContainText("Nothing else lets calls through.");

	// The request still waiting is answered as before; the next fetch goes through without asking.
	await page.locator("#approvals").getByRole("button", { name: "Deny" }).click();
	await expect(page.locator("#approvals")).toBeEmpty();
	await page.goto("/gaidin");
	await send(page, "fetch it again");
	await expect(page.locator("#log")).toContainText("The page says: page text.");
	await expect(page.locator("#approvals")).toBeEmpty();
	await page.goto("/activity");
	await expect(page.locator(".page")).toContainText("allowed once by rule r1");

	await page.goto("/rules");
	await row.getByRole("button", { name: "remove" }).click();
	await row.getByRole("button", { name: "Press again to remove for good" }).click();
	await expect(page.locator(".page")).toContainText("No rules yet.");
});

test("a tool no allow rule reaches can only get an ask rule", async ({ page }) => {
	await page.goto("/rules?tool=schedule_job");
	const form = page.locator(".rule-form");
	await expect(form.getByRole("button", { name: "allow without asking" })).toBeDisabled();
	await expect(form.getByRole("button", { name: "always ask" })).toHaveAttribute("aria-pressed", "true");
	await expect(form).toContainText("schedule_job always asks; only an ask rule can name it.");
	await form.getByRole("button", { name: "make rule" }).click();
	await expect(page.locator(".rule-row")).toContainText("ask");
	await expect(page.locator(".rule-row")).toContainText("schedule_job");
});
