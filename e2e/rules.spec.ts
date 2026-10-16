import type { Page } from "@playwright/test";
import type { Approval } from "../src/api.ts";
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

/**
 * Requests for a workspace write and a workspace run, as gaidin's /api/approvals gives them. The e2e server has no
 * workspaces, so the app is answered these; the rules made from them go to gaidin as any other.
 */
async function workspaceRequests(page: Page) {
	const now = Date.now();
	const base = { conversationId: 1, taskId: 1, createdAt: now, expiresAt: now + 3_600_000, status: "pending" } as const;
	const requests: Approval[] = [
		{ ...base, id: "write", tool: "workspace_write", summary: "write notes/Ideas/2026/inbox.md on egwene (91 characters)", ruleArgs: { workspace: "egwene", path: "notes/Ideas/2026/inbox.md" } },
		{ ...base, id: "run", taskId: 2, tool: "workspace_run", summary: "run on egwene: ls", ruleArgs: { workspace: "egwene", command: "ls" } },
	];
	await page.route("**/api/approvals", (route) => route.fulfill({ json: requests }));
}

/** Opens the Rules form from a workspace write's "Trust" link. */
async function trustFromCard(page: Page) {
	await workspaceRequests(page);
	await page.goto("/gaidin");
	const card = page.locator("#approvals .approval", { hasText: "workspace_write" });
	await card.getByRole("link", { name: "Trust …/Ideas/2026 for gaidin" }).click();
	await expect(page).toHaveURL(/\/rules\?/);
	return page.locator(".rule-form");
}

test("a workspace write's Trust link fills in a rule for its folder, which widens before it's saved", async ({ page }) => {
	const form = await trustFromCard(page);
	// A run has no folder to trust.
	const run = page.locator("#approvals .approval", { hasText: "workspace_run" });
	await expect(run.getByRole("link", { name: "make a rule" })).toHaveCount(1);
	await expect(run.getByRole("link", { name: /^Trust/ })).toHaveCount(0);

	await expect(form.getByRole("button", { name: "allow without asking" })).toHaveAttribute("aria-pressed", "true");
	await expect(form.getByRole("combobox", { name: /^agent/ })).toHaveValue("gaidin");
	await expect(form.getByRole("textbox", { name: /^tool/ })).toHaveValue("workspace_*");
	await expect(form.getByRole("checkbox", { name: "Use the condition on workspace" })).toBeChecked();
	await expect(form.getByRole("combobox", { name: "How workspace is matched" })).toHaveValue("equals");
	await expect(form.getByRole("textbox", { name: "Value for workspace" })).toHaveValue("egwene");
	await expect(form.getByRole("checkbox", { name: "Use the condition on path" })).toBeChecked();
	await expect(form.getByRole("combobox", { name: "How path is matched" })).toHaveValue("inside");
	await expect(form.getByRole("textbox", { name: "Value for path" })).toHaveValue("notes/Ideas/2026");
	await expect(form.getByRole("combobox", { name: /^lasts/ })).toHaveValue("never");
	await expect(form.getByRole("checkbox", { name: /even after outside text/ })).not.toBeChecked();
	await expect(form.locator(".warn-note")).toHaveCount(0);

	// Wider, then back, then wider again.
	const widen = form.getByRole("group", { name: "Widen the folder" });
	await widen.getByRole("button", { name: "Ideas" }).click();
	await expect(form.getByRole("textbox", { name: "Value for path" })).toHaveValue("notes/Ideas");
	await widen.getByRole("button", { name: "2026" }).click();
	await expect(form.getByRole("textbox", { name: "Value for path" })).toHaveValue("notes/Ideas/2026");
	await widen.getByRole("button", { name: "Ideas" }).click();
	await expect(widen.getByRole("button", { name: "Ideas" })).toHaveAttribute("aria-pressed", "true");

	await form.getByRole("button", { name: "make rule" }).click();
	const row = page.locator(".rule-row");
	await expect(row).toContainText("workspace_*");
	await expect(row).toContainText("for gaidin");
	await expect(row).toContainText("when workspace equals egwene and path inside notes/Ideas · until outside text is read");
	await expect(page.locator(".rule-form")).toHaveCount(0);
});

test("a refusal from gaidin shows on the page and keeps the form", async ({ page }) => {
	const form = await trustFromCard(page);
	await form.getByRole("checkbox", { name: "Use the condition on workspace" }).uncheck();
	await form.getByRole("button", { name: "make rule" }).click();
	await expect(page.locator(".page-problem")).toHaveText("An inside rule names its workspace too: workspace equals <name>.");
	await expect(form).toBeVisible();
	await expect(page.locator(".rule-row")).toHaveCount(0);
});

test("inside is offered on a path, for the workspace file tools only", async ({ page }) => {
	await page.goto("/rules");
	await page.getByRole("button", { name: "new rule" }).click();
	const form = page.locator(".rule-form");
	const tool = form.getByRole("textbox", { name: /^tool/ });
	const condition = async (arg: string) => {
		await form.getByRole("button", { name: "condition" }).click();
		await form.getByRole("textbox", { name: "Argument" }).last().fill(arg);
	};
	const ops = (arg: string) => form.getByRole("combobox", { name: `How ${arg} is matched` }).locator("option");
	await tool.fill("fetch_url");
	await condition("path");
	await expect(ops("path")).not.toContainText(["inside"]);
	await expect(ops("path")).toHaveText(["equals", "one-of", "starts-with", "contains", "host"]);
	for (const name of ["workspace_read", "workspace_write", "workspace_edit", "workspace_*"]) {
		await tool.fill(name);
		await expect(ops("path")).toHaveText(["equals", "one-of", "starts-with", "contains", "host", "inside"]);
	}
	await condition("url");
	await expect(ops("url")).toHaveText(["equals", "one-of", "starts-with", "contains", "host"]);
	await tool.fill("workspace_run");
	await expect(ops("path")).toHaveText(["equals", "one-of", "starts-with", "contains", "host"]);
});

test("an allow rule reaching workspace_run without a folder says it lets any command through", async ({ page }) => {
	await page.goto("/rules");
	await page.getByRole("button", { name: "new rule" }).click();
	const form = page.locator(".rule-form");
	const warning = form.locator(".warn-note");
	await form.getByRole("textbox", { name: /^tool/ }).fill("workspace_run");
	await expect(warning).toHaveText("This lets every agent run any command on any of its workspaces without asking, whatever the cwd.");
	await form.getByRole("button", { name: "always ask" }).click();
	await expect(warning).toHaveCount(0);
	await form.getByRole("button", { name: "allow without asking" }).click();

	// Brad's near miss: a cwd condition doesn't hold a command to it.
	await form.getByRole("combobox", { name: /^agent/ }).selectOption("gaidin");
	await form.getByRole("button", { name: "condition" }).click();
	await form.getByRole("textbox", { name: "Argument" }).last().fill("cwd");
	await form.getByRole("textbox", { name: "Value for cwd" }).fill("/home/brad/westwood/Projects");
	await expect(warning).toHaveText("This lets gaidin run any command on any of its workspaces without asking, whatever the cwd.");

	// The family reaches it too, until a folder holds it to file operations.
	await form.getByRole("textbox", { name: /^tool/ }).fill("workspace_*");
	await form.getByRole("button", { name: "condition" }).click();
	await form.getByRole("textbox", { name: "Argument" }).last().fill("workspace");
	await form.getByRole("textbox", { name: "Value for workspace" }).fill("egwene");
	await expect(warning).toHaveText("This lets gaidin run any command on egwene without asking, whatever the cwd.");
	await form.getByRole("button", { name: "condition" }).click();
	await form.getByRole("textbox", { name: "Argument" }).last().fill("path");
	await form.getByRole("combobox", { name: "How path is matched" }).selectOption("inside");
	await form.getByRole("textbox", { name: "Value for path" }).fill("notes");
	await expect(warning).toHaveCount(0);
});
