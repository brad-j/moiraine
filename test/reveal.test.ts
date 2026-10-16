// What of an answer streaming in is shown: whole words, and no Markdown left open at the end.
import assert from "node:assert/strict";
import test from "node:test";
import { settled } from "../src/conversation/reveal.ts";

/** What's shown of `text` when it's due up to the end of `prefix`. */
const at = (text: string, prefix: string) => {
	assert.ok(text.startsWith(prefix));
	return settled(text, prefix.length);
};

test("all of it shows once it's due", () => {
	assert.equal(settled("Hello, **Brad**.", 99), "Hello, **Brad**.");
	assert.equal(settled("Hello", 5), "Hello");
});

test("words show whole", () => {
	assert.equal(at("Hello there, Brad.", "Hello th"), "Hello ");
	assert.equal(at("Hello there, Brad.", "Hello there,"), "Hello there,");
	assert.equal(at("Hello there", "He"), "");
	// A word longer than words usually are shows in part rather than holding everything up.
	const long = `See ${"x".repeat(40)} there`;
	assert.equal(at(long, `See ${"x".repeat(30)}`), `See ${"x".repeat(30)}`);
});

test("an inline span waits for its end", () => {
	assert.equal(at("It's **really done** now.", "It's **really "), "It's ");
	assert.equal(at("It's **really done** now.", "It's **really done** "), "It's **really done** ");
	assert.equal(at("Run `pnpm check now` first", "Run `pnpm "), "Run ");
	assert.equal(at("Run `pnpm` first", "Run `pnpm` "), "Run `pnpm` ");
	assert.equal(at("See [the plan](https://example.com/plan) there", "See [the plan](https://exa"), "See ");
	assert.equal(at("See [the plan](https://example.com/plan) there", "See [the plan](https://example.com/plan) "), "See [the plan](https://example.com/plan) ");
	assert.equal(at("A *quick look* here", "A *quick "), "A ");
	// Marks that open nothing don't hold anything back.
	assert.equal(at("5 * 3 is 15 and [1] is a note", "5 * 3 is 15 and [1] is "), "5 * 3 is 15 and [1] is ");
	assert.equal(at("Use `**` for bold, then more", "Use `**` for bold, "), "Use `**` for bold, ");
	// An earlier line's spans are closed already.
	assert.equal(at("One **two**\nthree **four** five", "One **two**\nthree "), "One **two**\nthree ");
});

test("a span left open too long shows as it is", () => {
	const text = `A **${"word ".repeat(80)}end** done`;
	assert.equal(at(text, `A **${"word ".repeat(70)}`), `A **${"word ".repeat(70)}`);
});

test("a heading's or list item's mark waits for its text", () => {
	assert.equal(at("Intro\n\n## Backups\n", "Intro\n\n##"), "Intro\n\n");
	assert.equal(at("Intro\n- one\n- two\n", "Intro\n- one\n- "), "Intro\n- one\n");
	assert.equal(at("Intro\n1. one\n", "Intro\n1."), "Intro\n");
});

test("a code block shows as it comes, once its opening line is whole", () => {
	const text = "Try:\n\n```sh\nssh think-2 'pvesm **status and more'\n```\n";
	assert.equal(at(text, "Try:\n\n```s"), "Try:\n\n");
	assert.equal(at(text, "Try:\n\n```sh\n"), "Try:\n\n```sh\n");
	assert.equal(at(text, "Try:\n\n```sh\nssh think-2 'pvesm **status "), "Try:\n\n```sh\nssh think-2 'pvesm **status ");
});

test("a table waits for the line under its head, then shows a row at a time", () => {
	const text = "Hosts:\n\n| Host | Disk |\n|---|---|\n| think-1 | 61% |\n| think-2 | 87% |\n\nDone.";
	assert.equal(at(text, "Hosts:\n\n| Host | Di"), "Hosts:\n\n");
	assert.equal(at(text, "Hosts:\n\n| Host | Disk |\n"), "Hosts:\n\n");
	assert.equal(at(text, "Hosts:\n\n| Host | Disk |\n|---|-"), "Hosts:\n\n");
	assert.equal(at(text, "Hosts:\n\n| Host | Disk |\n|---|---|\n"), "Hosts:\n\n| Host | Disk |\n|---|---|\n");
	assert.equal(at(text, "Hosts:\n\n| Host | Disk |\n|---|---|\n| think-1 | 61% |\n| think-2 "), "Hosts:\n\n| Host | Disk |\n|---|---|\n| think-1 | 61% |\n");
	assert.equal(at(text, "Hosts:\n\n| Host | Disk |\n|---|---|\n| think-1 | 61% |\n| think-2 | 87% |\n\nDo"), "Hosts:\n\n| Host | Disk |\n|---|---|\n| think-1 | 61% |\n| think-2 | 87% |\n\n");
	// A line that starts with a bar but has none of a table's under it shows.
	assert.equal(at("| not a table\nreally not ", "| not a table\nreally "), "| not a table\nreally ");
});
