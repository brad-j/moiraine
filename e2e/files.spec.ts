import { crc32, deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";

/** A PNG of `width` × `height` random pixels, which barely compresses: about 3 bytes a pixel. */
function noisePng(width: number, height: number): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
	const rows = Buffer.alloc((width * 3 + 1) * height);
	for (let i = 0; i < rows.length; i++) rows[i] = i % (width * 3 + 1) === 0 ? 0 : (Math.random() * 256) | 0;
	return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const files = (page: Page) => page.getByRole("list", { name: "Files" });

async function attach(page: Page, ...given: { name: string; mimeType: string; buffer: Buffer }[]) {
	await page.locator("#prompt input[type=file]").setInputFiles(given);
}

test("an image goes to the model with the message, and shows in the log", async ({ page }) => {
	await page.goto("/app/");
	await attach(page, { name: "dog.png", mimeType: "image/png", buffer: PIXEL });
	const chip = files(page).locator(".attachment");
	await expect(chip).toHaveClass(/ready/);
	await expect(chip).toContainText("dog.png");
	await page.locator("#message").fill("look at this");
	await page.locator("#message").press("Enter");
	await expect(page.locator("#log")).toContainText("I can see 1 image.");
	await expect(page.locator("#log .row.you .said")).toHaveText("look at this");
	await expect(page.locator("#log .row.you img")).toHaveCount(1);
	// Sent, the files leave the composer.
	await expect(files(page)).toHaveCount(0);
});

test("another file is saved in the agent's sandbox, sent without text; one taken off doesn't go", async ({ page }) => {
	await page.goto("/app/");
	await attach(page, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("the NAS is in the hall closet") }, { name: "other.txt", mimeType: "text/plain", buffer: Buffer.from("not this") });
	await expect(files(page).locator(".attachment.ready")).toHaveCount(2);
	await files(page).getByRole("button", { name: "Remove other.txt" }).click();
	await page.locator("#send").click();
	await expect(page.locator("#log")).toContainText(/It's saved as uploads\/[0-9a-f]{8}-notes\.txt\./);
	await expect(page.locator("#log .row.you .files-note")).toContainText(/notes\.txt is saved as uploads\/[0-9a-f]{8}-notes\.txt \(text\/plain, 1 KB\)/);
	await expect(page.locator("#log")).not.toContainText("other.txt");
});

test("an image over what the model takes is made smaller first, and still goes as an image", async ({ page }) => {
	const big = noisePng(1500, 1500);
	expect(big.length).toBeGreaterThan(3_750_000);
	await page.goto("/app/");
	await attach(page, { name: "photo.png", mimeType: "image/png", buffer: big });
	const chip = files(page).locator(".attachment");
	await expect(chip).toHaveClass(/ready/, { timeout: 15_000 });
	// The chip shows the size that was sent.
	const [, amount = "99", unit = "MB"] = /([\d.]+) (KB|MB)/.exec((await chip.locator(".state").textContent()) ?? "") ?? [];
	expect(Number(amount) * (unit === "KB" ? 1000 : 1_000_000)).toBeLessThan(3_750_000);
	await page.locator("#message").fill("what's this?");
	await page.locator("#message").press("Enter");
	await expect(page.locator("#log")).toContainText("I can see 1 image.");
});

test("files dropped on the composer or pasted into it go with the message", async ({ page }) => {
	await page.goto("/app/");
	await page.locator("#message").waitFor();
	await page.evaluate((pixel) => {
		const bytes = Uint8Array.from(atob(pixel), (c) => c.charCodeAt(0));
		const dropped = new DataTransfer();
		dropped.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
		document.querySelector("#prompt")!.dispatchEvent(new DragEvent("drop", { dataTransfer: dropped, bubbles: true, cancelable: true }));
		const pasted = new DataTransfer();
		pasted.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
		document.querySelector("#message")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: pasted, bubbles: true, cancelable: true }));
	}, PIXEL.toString("base64"));
	await expect(files(page).locator(".attachment.ready")).toHaveCount(2);
	await page.locator("#message").fill("two");
	await page.locator("#message").press("Enter");
	await expect(page.locator("#log")).toContainText("I can see 2 images.");
});

test("a file over 20 MB isn't sent, and holds the message until it's taken off", async ({ page }) => {
	await page.goto("/app/");
	await attach(page, { name: "backup.tar", mimeType: "application/x-tar", buffer: Buffer.alloc(20_000_001) });
	const chip = files(page).locator(".attachment");
	await expect(chip).toHaveClass(/failed/);
	await expect(chip).toContainText("over 20 MB");
	await expect(page.locator("#send")).toBeDisabled();
	await files(page).getByRole("button", { name: "Remove backup.tar" }).click();
	await expect(page.locator("#send")).toBeEnabled();
});

test("a new thread starts with a file", async ({ page }) => {
	await page.goto("/app/gaidin/new");
	await expect(page.locator(".convo-head h1")).toHaveText("New thread");
	await attach(page, { name: "dog.png", mimeType: "image/png", buffer: PIXEL });
	await expect(files(page).locator(".attachment.ready")).toHaveCount(1);
	await page.locator("#message").fill("about the dog");
	await page.locator("#message").press("Enter");
	await expect(page).toHaveURL(/\/app\/gaidin\/t\/\d+$/);
	await expect(page.locator("#log")).toContainText("I can see 1 image.");
});
