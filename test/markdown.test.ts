// The Markdown component, rendered to a string: what a model's answer turns into, and what it must not.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import test, { after } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

// Node can't load .tsx itself, so vite's module loader compiles the component, as it does in the build.
const vite = await createServer({ configFile: false, root: resolve(import.meta.dirname, ".."), appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
after(() => vite.close());
const { Markdown } = (await vite.ssrLoadModule("/src/markdown.tsx")) as typeof import("../src/markdown.tsx");

const render = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));
const html = (inner: string) => `<div class="md">${inner}</div>`;

test("a backslash escape is the character as text", () => {
	assert.equal(render("Use \\*literal stars\\* and a\\_b"), html("<p>Use *literal stars* and a_b</p>"));
	assert.equal(render("Costs \\$5 and \\$10"), html("<p>Costs $5 and $10</p>"));
	assert.equal(render("\\# not a heading \\| bar"), html("<p># not a heading | bar</p>"));
	assert.equal(render("\\\\*x*"), html("<p>\\<em>x</em></p>"));
});

test("a backslash before anything else stays", () => {
	assert.equal(render("C:\\dir and \\é"), html("<p>C:\\dir and \\é</p>"));
});

test("an escaped delimiter closes no span", () => {
	assert.equal(render("*a\\*b*"), html("<p><em>a*b</em></p>"));
	assert.equal(render("_foo\\_bar_"), html("<p><em>foo_bar</em></p>"));
	assert.equal(render("*literal \\* star*"), html("<p><em>literal * star</em></p>"));
	assert.equal(render("**a\\**b**"), html("<p><strong>a**b</strong></p>"));
	assert.equal(render("*a\\\\*"), html("<p><em>a\\</em></p>"));
});

test("a backslash in code is kept, and an escaped pipe works in a table cell", () => {
	assert.equal(render("`a\\*b`"), html("<p><code>a\\*b</code></p>"));
	assert.match(render("| a |\n| - |\n| x \\| y |"), /<td>x \| y<\/td>/);
});

test("task items are disabled checkboxes", () => {
	const out = render("- [ ] todo\n- [x] done\n- [X] also *done*\n- [] plain");
	assert.match(out, /<li class="task"><input type="checkbox" aria-label="Not done" disabled=""\/>todo<\/li>/);
	assert.match(out, /<li class="task"><input type="checkbox" aria-label="Done" disabled="" checked=""\/>done<\/li>/);
	assert.match(out, /<li class="task"><input type="checkbox" aria-label="Done" disabled="" checked=""\/>also <em>done<\/em><\/li>/);
	assert.match(out, /<li>\[\] plain<\/li>/);
});

test("emphasis needs a word to open and close it", () => {
	assert.equal(render("2 * 3 * 4"), html("<p>2 * 3 * 4</p>"));
	assert.equal(render("snake_case_name"), html("<p>snake_case_name</p>"));
	assert.equal(render("*yes* and _yes_"), html("<p><em>yes</em> and <em>yes</em></p>"));
});

test("an autolink leaves trailing punctuation outside the link", () => {
	const href = 'href="https://example.com/a" target="_blank" rel="noopener noreferrer"';
	assert.equal(render("See https://example.com/a."), html(`<p>See <a ${href}>https://example.com/a</a>.</p>`));
	assert.equal(render("(https://example.com/a), ok"), html(`<p>(<a ${href}>https://example.com/a</a>), ok</p>`));
});

test("a javascript: link stays plain text", () => {
	const out = render("[click](javascript:alert(1)) and <javascript:alert(1)>");
	assert.doesNotMatch(out, /<a /);
	assert.doesNotMatch(out, /href/);
	assert.match(out, /click/);
});
