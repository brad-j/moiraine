import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

async function send(page: Page, text: string) {
	await page.locator("#message").fill(text);
	await page.locator("#message").press("Enter");
}

const pages = (page: Page) => page.getByRole("group", { name: "Pages" });

test("the schedule lists reminders and jobs, and pauses, opens and cancels them", async ({ page }) => {
	await page.goto("/app/");
	await send(page, "remind me about the dentist");
	await expect(page.locator("#log")).toContainText("Reminder");
	await send(page, "set up a briefing");
	await page.locator("#approvals").getByRole("button", { name: "Allow once" }).click();
	await expect(page.locator("#approvals")).toBeEmpty();
	await expect(pages(page).getByRole("link", { name: /Schedule/ })).toContainText("2");

	await pages(page).getByRole("link", { name: /Schedule/ }).click();
	await expect(page).toHaveURL(/\/app\/gaidin\/schedule$/);
	await expect(page.locator(".convo-head h1")).toHaveText("Schedule");
	const reminder = page.locator(".sched-row", { hasText: "Call the dentist" });
	await expect(reminder).toContainText(/in (1 h 59 min|2 h)/);
	const job = page.locator(".sched-row", { hasText: "Morning briefing" });
	await expect(job).toContainText("at 07:30, weekdays");

	await job.getByRole("button", { name: "pause" }).click();
	await expect(job.locator(".due")).toHaveText("paused");
	await expect(pages(page).locator(".count")).toHaveClass(/warn/);
	await job.getByRole("button", { name: "resume" }).click();
	await expect(job.getByRole("button", { name: "pause" })).toBeVisible();
	await expect(pages(page).locator(".count")).not.toHaveClass(/warn/);

	await job.getByRole("button", { name: "Morning briefing" }).click();
	await expect(job).toContainText("Summarise the weather and today's calendar.");
	await expect(job).toContainText("no reports yet");

	// Cancelling takes a second press.
	await reminder.getByRole("button", { name: "cancel" }).click();
	await reminder.getByRole("button", { name: "Press again to cancel for good" }).click();
	await expect(page.locator(".page")).toContainText("No reminders.");
	await expect(pages(page).locator(".count")).toHaveText("1");
});

test("+ new reminder starts the request in the home conversation's prompt, on a phone too", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/app/gaidin/schedule");
	await expect(page.locator("#message")).toHaveCount(0);
	await page.getByRole("button", { name: "+ new reminder" }).click();
	await expect(page).toHaveURL(/\/app\/gaidin$/);
	await expect(page.locator("#message")).toHaveValue("Remind me to ");
	await expect(page.locator("#message")).toBeFocused();
	// The draft left the address, so a reload starts empty.
	await page.reload();
	await expect(page.locator("#message")).toHaveValue("");
});

test("memory adds, edits and forgets shared notes, keeps work notes apart, and /remember adds one from a conversation", async ({ page }) => {
	await page.goto("/app/");
	await send(page, "/remember the dog is called Bela");
	await expect(page.locator("#log")).toContainText("Noted [1]: the dog is called Bela");
	await send(page, "/memory");
	await expect(page).toHaveURL(/\/app\/gaidin\/memory$/);
	const shared = page.locator("section", { has: page.getByRole("heading", { name: "Shared notes" }) });
	const work = page.locator("section", { has: page.getByRole("heading", { name: "gaidin's work notes" }) });
	await expect(shared.locator(".note-row")).toHaveCount(1);
	await expect(shared.locator(".usage")).toHaveText("22 of 8,000 characters");

	await shared.getByRole("textbox", { name: "A new note" }).fill("The NAS is in the hall closet.");
	await shared.getByRole("textbox", { name: "A new note" }).press("Enter");
	await expect(shared.locator(".note-row").first()).toContainText("The NAS is in the hall closet.");
	await expect(shared.getByRole("textbox", { name: "A new note" })).toHaveValue("");

	const bela = shared.locator(".note-row", { hasText: "Bela" });
	await bela.getByRole("button", { name: "edit" }).click();
	const box = shared.getByRole("textbox", { name: "Note 1" });
	await box.fill("The dog is called Bela, and she's afraid of the hoover.");
	await box.press("Enter");
	await expect(shared.locator(".note-row", { hasText: "hoover" })).toContainText("you");

	const nas = shared.locator(".note-row", { hasText: "NAS" });
	await nas.getByRole("button", { name: "forget" }).click();
	await nas.getByRole("button", { name: "Press again to forget for good" }).click();
	await expect(shared.locator(".note-row")).toHaveCount(1);
	await expect(shared).not.toContainText("NAS");

	// A work note is the agent's own: another agent's page doesn't show it, and the shared notes are on both.
	await expect(work).toContainText("No work notes yet.");
	await work.getByRole("textbox", { name: "A new work note" }).fill("Backups run at 03:00 on think-2.");
	await work.getByRole("textbox", { name: "A new work note" }).press("Enter");
	await expect(work.locator(".note-row")).toContainText("Backups run at 03:00");
	await expect(shared).not.toContainText("Backups");

	expect((await page.request.post("/api/agents/save", { data: { id: "scout", name: "Scout", job: "Looks things up." } })).ok()).toBe(true);
	await page.goto("/app/scout/memory");
	await expect(page.locator("section", { has: page.getByRole("heading", { name: "Scout's work notes" }) })).toContainText("No work notes yet.");
	await expect(page.locator("section", { has: page.getByRole("heading", { name: "Shared notes" }) })).toContainText("hoover");
});

test("Esc in a text box on a page leaves the run going; in the conversation it stops it", async ({ page }) => {
	await page.goto("/app/");
	await send(page, "ask me something");
	await expect(page.locator("#approvals")).toContainText("Keep the old branch?");
	await pages(page).getByRole("link", { name: "Memory" }).click();
	await page.getByRole("textbox", { name: "A new note" }).press("Escape");
	await page.keyboard.press("Escape");
	// The question still waits in the dock on the page.
	await expect(page.locator("#approvals")).toContainText("Keep the old branch?");

	await page.getByRole("navigation", { name: "Conversations" }).getByRole("link", { name: "Home conversation" }).click();
	await expect(page.locator("#statusline .status")).toHaveText("working");
	await page.locator("#message").press("Escape");
	await expect(page.locator("#log .row.stopped")).toHaveCount(1);
	await expect(page.locator("#approvals")).toBeEmpty();
});

test("the web view's addresses open the default agent's page, and /next opens the schedule", async ({ page }) => {
	await page.goto("/app/#/schedule");
	await expect(page).toHaveURL(/\/app\/gaidin\/schedule$/);
	await page.goto("/app/#/memory");
	await expect(page).toHaveURL(/\/app\/gaidin\/memory$/);
	await page.goto("/app/#/");
	await expect(page).toHaveURL(/\/app\/gaidin$/);
	await send(page, "/next");
	await expect(page).toHaveURL(/\/app\/gaidin\/schedule$/);
});
