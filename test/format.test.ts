// The folder helpers behind "Trust <folder>": a file's folder, the ones it widens to, and its short label.
import assert from "node:assert/strict";
import test from "node:test";
import { ancestors, cleanPath, folderOf, ownerMessage, shortFolder } from "../src/format.ts";

test("a path is cleaned as gaidin compares it", () => {
	assert.equal(cleanPath("notes/./Ideas//a.md"), "notes/Ideas/a.md");
	assert.equal(cleanPath("notes/x/../Ideas/a.md"), "notes/Ideas/a.md");
	assert.equal(cleanPath("../out.md"), "../out.md");
	assert.equal(cleanPath("/home/brad/../brad/a.md"), "/home/brad/a.md");
	assert.equal(cleanPath("/../a.md"), "/a.md");
	assert.equal(cleanPath("a/.."), ".");
});

test("a file's folder is its parent, unless that's a root or out of the first one", () => {
	assert.equal(folderOf("notes/Ideas/2026/inbox.md"), "notes/Ideas/2026");
	assert.equal(folderOf("/home/brad/westwood/Notes/Ideas/a.md"), "/home/brad/westwood/Notes/Ideas");
	assert.equal(folderOf("notes/../Ideas/a.md"), "Ideas");
	assert.equal(folderOf("README.md"), undefined);
	assert.equal(folderOf("/README.md"), undefined);
	assert.equal(folderOf("../elsewhere/a.md"), undefined);
});

test("a folder widens to each of its ancestors", () => {
	assert.deepEqual(ancestors("notes/Ideas/2026"), [
		{ folder: "notes", name: "notes" },
		{ folder: "notes/Ideas", name: "Ideas" },
		{ folder: "notes/Ideas/2026", name: "2026" },
	]);
	assert.deepEqual(ancestors("/home/brad").map((a) => a.folder), ["/home", "/home/brad"]);
});

test("a long folder is labeled by its last two names", () => {
	assert.equal(shortFolder("notes/Ideas"), "notes/Ideas");
	assert.equal(shortFolder("/home/brad/westwood/Notes/Ideas"), "…/Notes/Ideas");
	assert.equal(shortFolder("notes/Ideas/2026"), "…/Ideas/2026");
});

test("what a speaker heard comes apart from its mark, with the speaker's name", () => {
	assert.deepEqual(ownerMessage("[Sun 2026-10-18 19:14 GMT-4] [spoken] (kitchen speaker) plan the garden"), { time: "Sun 2026-10-18 19:14 GMT-4", speaker: "kitchen", text: "plan the garden", images: [], files: [] });
	assert.equal(ownerMessage("[Sun 2026-10-18 19:14 GMT-4] plan the garden").speaker, undefined);
	assert.equal(ownerMessage("[Sun 2026-10-18 19:14 GMT-4] [spoken] by me").text, "[spoken] by me");
});
