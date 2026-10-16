import type { Page } from "@playwright/test";
import { expect, system, test } from "./fixtures.ts";

async function send(page: Page, text: string) {
	await page.locator("#message").fill(text);
	await page.locator("#message").press("Enter");
}

const pages = (page: Page) => page.getByRole("group", { name: "Pages" });

test("the schedule lists reminders and jobs, and pauses, opens and cancels them", async ({ page }) => {
	await page.goto("/");
	await send(page, "remind me about the dentist");
	await expect(page.locator("#log")).toContainText("Reminder");
	await send(page, "set up a briefing");
	await page.locator("#approvals").getByRole("button", { name: "Allow once" }).click();
	await expect(page.locator("#approvals")).toBeEmpty();
	await expect(pages(page).getByRole("link", { name: /Schedule/ })).toContainText("2");

	await pages(page).getByRole("link", { name: /Schedule/ }).click();
	await expect(page).toHaveURL(/\/gaidin\/schedule$/);
	await expect(page.locator(".convo-head h1")).toHaveText("Schedule");
	const reminder = page.locator(".sched-row", { hasText: "Call the dentist" });
	await expect(reminder).toContainText(/in (1 h 59 min|2 h)/);
	const job = page.locator(".sched-row", { hasText: "Morning briefing" });
	await expect(job).toContainText("at 07:30, weekdays");

	await job.getByRole("button", { name: "pause" }).click();
	await expect(job.locator(".due")).toHaveText("paused");
	await expect(pages(page).getByRole("link", { name: /Schedule/ }).locator(".count")).toHaveClass(/warn/);
	await job.getByRole("button", { name: "resume" }).click();
	await expect(job.getByRole("button", { name: "pause" })).toBeVisible();
	await expect(pages(page).getByRole("link", { name: /Schedule/ }).locator(".count")).not.toHaveClass(/warn/);

	await job.getByRole("button", { name: "Morning briefing" }).click();
	await expect(job).toContainText("Summarise the weather and today's calendar.");
	await expect(job).toContainText("no reports yet");

	// Cancelling takes a second press.
	await reminder.getByRole("button", { name: "cancel" }).click();
	await reminder.getByRole("button", { name: "Press again to cancel for good" }).click();
	await expect(page.locator(".page")).toContainText("No reminders.");
	await expect(pages(page).getByRole("link", { name: /Schedule/ }).locator(".count")).toHaveText("1");
});

test("+ new reminder starts the request in the home conversation's prompt, on a phone too", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/gaidin/schedule");
	await expect(page.locator("#message")).toHaveCount(0);
	await page.getByRole("button", { name: "new reminder" }).click();
	await expect(page).toHaveURL(/\/gaidin$/);
	await expect(page.locator("#message")).toHaveValue("Remind me to ");
	await expect(page.locator("#message")).toBeFocused();
	// The draft left the address, so a reload starts empty.
	await page.reload();
	await expect(page.locator("#message")).toHaveValue("");
});

test("memory adds, edits and forgets shared notes, keeps work notes apart, and /remember adds one from a conversation", async ({ page }) => {
	await page.goto("/");
	await send(page, "/remember the dog is called Bela");
	await expect(page.locator("#log")).toContainText("Noted [1]: the dog is called Bela");
	await send(page, "/memory");
	await expect(page).toHaveURL(/\/gaidin\/memory$/);
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
	await page.goto("/scout/memory");
	await expect(page.locator("section", { has: page.getByRole("heading", { name: "Scout's work notes" }) })).toContainText("No work notes yet.");
	await expect(page.locator("section", { has: page.getByRole("heading", { name: "Shared notes" }) })).toContainText("hoover");
});

test("Esc in a text box on a page leaves the run going; in the conversation it stops it", async ({ page }) => {
	await page.goto("/");
	await send(page, "ask me something");
	await expect(page.locator("#approvals")).toContainText("Keep the old branch?");
	await pages(page).getByRole("link", { name: "Memory" }).click();
	await page.getByRole("textbox", { name: "A new note" }).press("Escape");
	await page.keyboard.press("Escape");
	// The question still waits in the dock on the page.
	await expect(page.locator("#approvals")).toContainText("Keep the old branch?");

	await page.locator("#sidebar .agents li.current > .agent").click();
	await expect(page.locator("#statusline .status")).toHaveText("working");
	await page.locator("#message").press("Escape");
	await expect(page.locator("#log .row.stopped")).toHaveCount(1);
	await expect(page.locator("#approvals")).toBeEmpty();
});

test("the web view's addresses open the default agent's page, and /next opens the schedule", async ({ page }) => {
	await page.goto("/#/schedule");
	await expect(page).toHaveURL(/\/gaidin\/schedule$/);
	await page.goto("/#/memory");
	await expect(page).toHaveURL(/\/gaidin\/memory$/);
	await page.goto("/#/");
	await expect(page).toHaveURL(/\/gaidin$/);
	await send(page, "/next");
	await expect(page).toHaveURL(/\/gaidin\/schedule$/);
});

test("skills lists the gaidin skill and reads its files, following links between them", async ({ page }) => {
	await page.goto("/");
	await pages(page).getByRole("link", { name: "Skills" }).click();
	await expect(page).toHaveURL(/\/gaidin\/skills$/);
	await expect(page.locator(".skill-row")).toHaveCount(1);
	await page.locator(".skill-row", { hasText: "gaidin" }).click();
	await expect(page).toHaveURL(/\/gaidin\/skills\/gaidin$/);
	const doc = page.locator(".skill-doc");
	await expect(doc).toContainText("This is gaidin's documentation");
	// The front matter is shown as the description above, not in the document.
	await expect(doc).not.toContainText("description:");

	await page.getByRole("navigation", { name: "Files" }).getByRole("link", { name: "tools.md" }).click();
	await expect(page).toHaveURL(/\/gaidin\/skills\/gaidin\/tools\.md$/);
	await expect(doc.locator("h2")).toHaveText("Tools");
	// A link to another doc opens it here, at the heading it names.
	await doc.getByRole("link", { name: "Security" }).first().click();
	await expect(page).toHaveURL(/\/gaidin\/skills\/gaidin\/security\.md#[a-z-]+$/);
	await expect(doc.locator("h2")).toHaveText("Security");

	await page.reload();
	await expect(doc.locator("h2")).toHaveText("Security");
	await page.goBack();
	await expect(doc.locator("h2")).toHaveText("Tools");
});

test("the owner creates a skill, adds a file and edits it, and removes the skill", async ({ page }) => {
	await page.goto("/gaidin/skills");
	await expect(page.locator(".skill-row", { hasText: "gaidin" })).toBeVisible();
	await page.getByRole("button", { name: "new skill" }).click();
	await page.locator(".skill-form input").fill("homelab-alerts");
	await page.getByRole("textbox", { name: "Description" }).fill("What to do when a homelab alert comes in.");
	await page.getByRole("textbox", { name: "Guide" }).fill("# Homelab alerts\n\nCheck the NAS first.");
	await page.getByRole("button", { name: "create skill" }).click();
	await expect(page).toHaveURL(/\/skills\/homelab-alerts$/);
	const doc = page.locator(".skill-doc");
	await expect(doc.locator("h2")).toHaveText("Homelab alerts");
	await expect(page.locator(".skill-head .tag")).toHaveText("local");

	await page.getByRole("button", { name: "file", exact: true }).click();
	await page.getByRole("textbox", { name: "New file's path" }).fill("references/backups.md");
	await page.getByRole("textbox", { name: "New file's path" }).press("Enter");
	await page.getByRole("textbox", { name: "homelab-alerts/references/backups.md" }).fill("# Backups\n\nThey run at 03:00.");
	await page.getByRole("button", { name: "create file" }).click();
	await expect(doc.locator("h2")).toHaveText("Backups");

	await page.getByRole("button", { name: "edit" }).click();
	await page.getByRole("textbox", { name: "homelab-alerts/references/backups.md" }).fill("# Backups\n\nThey run at 04:00 now.");
	await page.getByRole("button", { name: "save" }).click();
	await expect(doc).toContainText("They run at 04:00 now.");

	// A broken SKILL.md isn't saved, and the page says why.
	await page.getByRole("navigation", { name: "Files" }).getByRole("link", { name: "SKILL.md" }).click();
	await page.getByRole("button", { name: "edit" }).click();
	await page.getByRole("textbox", { name: "homelab-alerts/SKILL.md" }).fill("no front matter");
	await page.getByRole("button", { name: "save" }).click();
	await expect(page.locator(".page-problem")).toHaveText("SKILL.md has no front matter between --- lines");
	await page.getByRole("button", { name: "cancel" }).click();

	await page.getByRole("button", { name: "remove skill" }).click();
	await page.getByRole("button", { name: "Press again to remove skill for good" }).click();
	await expect(page).toHaveURL(/\/skills$/);
	await expect(page.locator(".skill-row")).toHaveCount(1);
	// The built-in skill has nothing to change.
	await page.locator(".skill-row", { hasText: "gaidin" }).click();
	await expect(page.getByRole("button", { name: "edit" })).toHaveCount(0);
});

test("settings switch the thinking and a tool, keep the instructions, and say what notifications need", async ({ page }) => {
	await page.goto("/gaidin/settings");
	const thinking = page.getByRole("group", { name: "Thinking" });
	await thinking.getByRole("button", { name: "high" }).click();
	await expect(thinking.getByRole("button", { name: "high" })).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator(".page")).toContainText("Thinking set to high. Applies from the next request.");

	const fetchTool = page.getByRole("switch", { name: "fetch_url" });
	await expect(fetchTool).toHaveAttribute("aria-checked", "true");
	await fetchTool.click();
	await expect(fetchTool).toHaveAttribute("aria-checked", "false");
	// Switching a tool kept the thinking level.
	await expect(thinking.getByRole("button", { name: "high" })).toHaveAttribute("aria-pressed", "true");

	const instructions = page.getByRole("textbox", { name: "Standing instructions" });
	await instructions.fill("Answer in British English.");
	await page.locator("section", { has: page.getByRole("heading", { name: "Standing instructions" }) }).getByRole("button", { name: "save" }).click();
	await expect(page.locator(".page")).toContainText("Standing instructions saved.");
	await page.reload();
	await expect(page.getByRole("textbox", { name: "Standing instructions" })).toHaveValue("Answer in British English.");
	await expect(page.getByRole("switch", { name: "fetch_url" })).toHaveAttribute("aria-checked", "false");
	await expect(page.locator(".page")).toContainText("Notifications need web.url in gaidin's settings file.");
	await page.locator("#sidebar .agents li.current > .agent").click();
	await expect(page.locator("#statusline")).toContainText("fetch_url off");
});

test("settings rename an agent, remove a host allowed for good, and let it message another agent", async ({ page }) => {
	expect((await page.request.post("/api/agents/save", { data: { id: "scout", name: "Scout", job: "" } })).ok()).toBe(true);
	await page.goto("/");
	await send(page, "fetch the page");
	await page.locator("#approvals").getByRole("button", { name: /^Always/ }).click();
	await expect(page.locator("#log")).toContainText("The page says: page text.");

	await send(page, "/settings");
	await expect(page).toHaveURL(/\/gaidin\/settings$/);
	const access = page.locator("section", { has: page.getByRole("heading", { name: "Access" }) });
	await expect(access.locator(".chip")).toContainText("site.test");
	await access.getByRole("button", { name: "Remove site.test" }).click();
	await expect(access).toContainText("None yet.");

	// The host is gone, so the next fetch asks again.
	await page.locator("#sidebar .agents li.current > .agent").click();
	await send(page, "fetch it again");
	await expect(page.locator("#approvals")).toContainText("fetch_url");
	await page.locator("#approvals").getByRole("button", { name: "Deny" }).click();
	await expect(page.locator("#approvals")).toBeEmpty();

	await send(page, "/settings");
	await access.getByRole("switch", { name: "Scout" }).click();
	await expect(access.getByRole("switch", { name: "Scout" })).toHaveAttribute("aria-checked", "true");
	await access.getByRole("switch", { name: "personal" }).click();
	await expect(access.getByRole("switch", { name: "personal" })).toHaveAttribute("aria-checked", "true");
	await expect(access).toContainText("personal given.");

	await page.getByRole("textbox", { name: "Job" }).fill("Looks after the house.");
	await page.getByRole("textbox", { name: "Name" }).fill("Gaidin");
	await page.locator("section", { has: page.getByRole("heading", { name: "Agent" }) }).getByRole("button", { name: "save" }).click();
	await expect(page.locator(".page")).toContainText("Saved.");
	await expect(page.locator("#sidebar .agents .current .name")).toHaveText("Gaidin");
	await expect(page.getByRole("textbox", { name: "Job" })).toHaveValue("Looks after the house.");
	await page.reload();
	await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Gaidin");
	await expect(access.getByRole("switch", { name: "Scout" })).toHaveAttribute("aria-checked", "true");
	await expect(access.getByRole("switch", { name: "personal" })).toHaveAttribute("aria-checked", "true");
	await access.getByRole("switch", { name: "personal" }).click();
	await expect(access.getByRole("switch", { name: "personal" })).toHaveAttribute("aria-checked", "false");

	// Sites it acts on without asking, added when an approval allows one, are removed here.
	expect((await page.request.post("/api/agents/save", { data: { id: "gaidin", actHosts: [{ profile: "personal", hosts: ["shop.example", "mail.example"] }] } })).ok()).toBe(true);
	await page.reload();
	await expect(access.locator(".chip", { hasText: "shop.example" })).toContainText("in personal");
	await access.getByRole("button", { name: "Remove shop.example in personal" }).click();
	await expect(access).toContainText("shop.example removed: Gaidin asks before acting on it in personal.");
	await expect(access.locator(".chip", { hasText: "shop.example" })).toHaveCount(0);
	await expect(access.locator(".chip", { hasText: "mail.example" })).toHaveCount(1);
});

test("the agents page makes an agent, archives it and restores it", async ({ page }) => {
	await page.goto("/");
	await (await system(page)).getByRole("link", { name: "Agents" }).click();
	await expect(page).toHaveURL(/\/agents$/);
	// The rail keeps the agent shown last, and the column stays on System.
	await expect(page.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
	await expect(page.locator("#sidebar .agents .current .name")).toHaveText("gaidin");
	await expect(page.locator(".agent-row")).toHaveCount(1);
	await expect(page.locator(".agent-row")).toContainText("default");
	await expect(page.locator(".agent-row").getByRole("button", { name: "archive" })).toHaveCount(0);

	await page.getByRole("button", { name: "new agent" }).click();
	const form = page.locator(".skill-form");
	await form.locator("input").first().fill("Scout");
	// The id follows the name.
	await expect(form.locator("input").nth(1)).toHaveValue("scout");
	await form.locator("input").nth(2).fill("Looks things up.");
	await form.getByRole("button", { name: "make agent" }).click();
	await expect(page).toHaveURL(/\/scout\/settings$/);
	await expect(page.locator("#sidebar .agents .current .name")).toHaveText("Scout");

	await (await system(page)).getByRole("link", { name: "Agents" }).click();
	const scout = page.locator(".agent-row", { hasText: "Scout" });
	await expect(scout).toContainText("Looks things up.");
	await scout.getByRole("button", { name: "archive" }).click();
	await scout.getByRole("button", { name: "Press again to archive for good" }).click();
	const archived = page.locator("section", { has: page.getByRole("heading", { name: "Archived" }) });
	await expect(archived.locator(".agent-row")).toContainText("Scout");
	await archived.getByRole("button", { name: "restore" }).click();
	await expect(page.locator("section", { has: page.getByRole("heading", { name: "Archived" }) })).toHaveCount(0);

	// An id the app's pages use is refused before it's sent.
	await page.getByRole("button", { name: "new agent" }).click();
	await form.locator("input").first().fill("Activity");
	await expect(form).toContainText("activity is the address of one of the app's pages.");
	await expect(form.getByRole("button", { name: "make agent" })).toBeDisabled();
});

test("activity shows spend against the limits and what each agent did", async ({ page }) => {
	await page.goto("/");
	await send(page, "fetch the page");
	await page.locator("#approvals").getByRole("button", { name: "Allow once" }).click();
	await expect(page.locator("#log")).toContainText("The page says: page text.");
	await send(page, "/timeline");
	await expect(page).toHaveURL(/\/activity$/);
	await expect(page.getByRole("meter", { name: /^today: \$0\.000 of \$5\.00$/ })).toBeVisible();
	await expect(page.locator(".event.is-tool")).toContainText("fetch_url");
	await expect(page.locator(".event.is-tool .agent")).toHaveText("gaidin");
	await expect(page.locator(".event.is-tool .outcome")).toHaveText("ok");
	await expect(page.locator(".event.is-approval")).toContainText("allowed once");
});

test("an agent's picture is chosen in settings, shown wherever the agent is, and taken away again", async ({ page }) => {
	await page.goto("/gaidin");
	await page.locator("#message").fill("hi");
	await page.locator("#message").press("Enter");
	await expect(page.locator("#log .row.gaidin .k")).toHaveText("gaidin");
	await expect(page.locator("#sidebar .agents li.current .avatar.monogram")).toHaveCount(1);

	await page.goto("/gaidin/settings");
	// A 1×1 PNG, which the page makes a square WebP before sending.
	const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
	await page.getByLabel("Picture file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: pixel });
	const shown = page.locator("#sidebar .agents li.current img.avatar");
	await expect(shown).toHaveAttribute("src", /^\/api\/agents\/avatar\?id=gaidin&v=gaidin-[0-9a-f]{12}\.(webp|png)$/);
	expect(await shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
	await page.goto("/agents");
	await expect(page.locator(".agent-row img.avatar")).toHaveCount(1);

	await page.goto("/gaidin/settings");
	await page.getByRole("button", { name: "remove" }).click();
	await expect(page.locator("#sidebar .agents li.current .avatar.monogram")).toHaveCount(1);
});
