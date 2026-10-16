import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

const pages = (page: Page) => page.getByRole("group", { name: "Pages" });

test("a connector is signed in from its page and comes back to it, its tools set, given to an agent, and removed", async ({ page }) => {
	await page.goto("/");
	// It waits for its first sign-in, which the sidebar counts.
	await expect(pages(page).getByRole("link", { name: /Connectors/ }).locator(".count")).toHaveText("1");
	await pages(page).getByRole("link", { name: /Connectors/ }).click();
	await expect(page).toHaveURL(/\/connectors$/);
	const row = page.locator(".connector-row", { hasText: "home" });
	await expect(row.locator(".tag").first()).toHaveText("needs signing in");

	// Off to the service's sign-in, which sends the browser back here.
	await row.getByRole("button", { name: "sign in" }).click();
	await expect(page).toHaveURL(/\/connectors\?signed_in=home$/);
	await expect(page.locator(".page-note.done")).toHaveText("home is signed in, with 2 tools.");
	await expect(row.locator(".tag").first()).toHaveText("connected");
	await expect(row).toContainText("MCP 2025-06-18");
	await expect(pages(page).getByRole("link", { name: /Connectors/ }).locator(".count")).toHaveCount(0);

	const live = row.locator(".tool-row", { hasText: "GetLiveContext" });
	const turnOn = row.locator(".tool-row", { hasText: "HassTurnOn" });
	await expect(live.getByRole("button", { name: "allow" })).toHaveAttribute("aria-pressed", "true");
	await expect(turnOn.getByRole("button", { name: "ask" })).toHaveAttribute("aria-pressed", "true");
	await turnOn.getByRole("button", { name: "off" }).click();
	await expect(turnOn.getByRole("button", { name: "off" })).toHaveAttribute("aria-pressed", "true");
	await page.reload();
	await expect(turnOn.getByRole("button", { name: "off" })).toHaveAttribute("aria-pressed", "true");

	// Given to gaidin on its settings page.
	await page.goto("/gaidin/settings");
	const access = page.locator("section", { has: page.getByRole("heading", { name: "Access" }) });
	await access.getByRole("switch", { name: "home" }).click();
	await expect(access).toContainText("home given.");
	await page.goto("/connectors");
	await expect(row).toContainText("given to gaidin");

	// An address that isn't one is refused, and says why.
	await page.getByRole("button", { name: "add" }).click();
	await page.getByRole("textbox", { name: /^name/ }).fill("mail");
	await page.getByRole("textbox", { name: /^server/ }).fill("mcp.example.com/mcp");
	await page.getByRole("button", { name: "add connector" }).click();
	await expect(page.locator(".page-problem")).toHaveText("mcp.example.com/mcp isn't a URL.");
	await page.getByRole("button", { name: "cancel" }).click();

	await row.getByRole("button", { name: "remove" }).click();
	await row.getByRole("button", { name: "Press again to remove for good" }).click();
	await expect(page.locator(".connector-row")).toHaveCount(0);
	await expect(page.locator(".page")).toContainText("No connectors yet.");
});
