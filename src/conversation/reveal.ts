// An answer as it streams in. gaidin sends what the model has written about ten times a second, a few words at a time,
// and drawn as it comes the text lurches forward in steps. Instead the answer is shown a little behind what has
// arrived, at a pace that follows how fast it's arriving, a word at a time; and a span whose Markdown isn't closed yet,
// such as **bold** or a table's head, waits for its end rather than showing its marks.
import { useEffect, useRef, useState } from "react";

/** How far behind what's arrived the shown text runs while the model writes, in ms: a little over gaidin's 100 ms between partials, so it flows across them. */
const LAG_MS = 180;
/** How far behind it runs once the answer is done, so the rest follows quickly. */
const DONE_LAG_MS = 60;
/** The slowest pace, in characters a millisecond, so the end of a burst doesn't crawl. */
const MIN_PACE = 0.05;
/** The most text held back for its Markdown to close, in characters, before it's shown as it is. */
const HOLD = 240;
/** The longest word waited for, in characters, before a word is shown in part. */
const WORD = 24;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** A heading's or list item's mark with nothing after it yet. */
const BARE_MARK = /^\s*(#{1,6}|[-*+]|\d{1,9}[.)])\s*$/;

const still = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * How many characters of `text` to show now. Text that's there when this is first drawn shows at once, unless it's
 * `live`, still being written; from then on, what's added comes in at an even pace, and the rest quickly once it's done.
 */
export function useReveal(text: string, live: boolean): number {
	const length = text.length;
	const [shown, setShown] = useState(() => (live && !still() ? 0 : length));
	const at = useRef(shown);
	useEffect(() => {
		// The text was replaced by a shorter one, as when a message is sent again whole.
		at.current = Math.min(at.current, length);
		if (at.current === length || still()) {
			at.current = length;
			setShown(length);
			return;
		}
		let before = performance.now();
		let frame = requestAnimationFrame(function step(now) {
			const elapsed = Math.max(0, now - before);
			before = now;
			const behind = length - at.current;
			at.current = Math.min(length, at.current + Math.max((behind * elapsed) / (live ? LAG_MS : DONE_LAG_MS), MIN_PACE * elapsed));
			setShown(Math.floor(at.current));
			if (at.current < length) frame = requestAnimationFrame(step);
		});
		return () => cancelAnimationFrame(frame);
	}, [length, live]);
	return Math.min(shown, length);
}

/**
 * What of `text` to show when `upTo` of its characters are due: whole words, and no Markdown left open at the end, so
 * marks such as ** and | don't flash before what they make. All of it once `upTo` reaches its end.
 */
export function settled(text: string, upTo: number): string {
	if (upTo >= text.length) return text;
	let cut = text.slice(0, Math.max(0, upTo));
	// Whole words: back to the last space, unless the word is longer than words usually are.
	if (!/\s/.test(text[cut.length] ?? " ")) {
		const space = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("\n"));
		if (cut.length - space <= WORD) cut = cut.slice(0, space + 1);
	}
	const end = cut.length;
	const hold = (at: number) => (end - at <= HOLD ? cut.slice(0, at) : cut);
	const lines = cut.split("\n");
	const lineStart = end - lines.at(-1)!.length;
	// Inside a code block everything shows as it comes; its opening line waits until it's whole.
	if (lines.slice(0, -1).filter((line) => FENCE.test(line)).length % 2 === 1) return cut;
	const line = lines.at(-1)!;
	if (FENCE.test(line) || BARE_MARK.test(line)) return hold(lineStart);
	const table = tableStart(lines, end);
	if (table !== undefined) return hold(table);
	const open = openSpan(line);
	return open === undefined ? cut : hold(lineStart + open);
}

/**
 * Where a table being written should be cut, or undefined: at its head until the line under it makes it a table, then
 * at a row until the row is whole.
 */
function tableStart(lines: string[], end: number): number | undefined {
	// The last element is the line being written, empty when the text ends with a line break.
	const whole = lines.slice(0, -1);
	const writing = lines.at(-1)!;
	let first = whole.length;
	while (first > 0 && whole[first - 1]!.trimStart().startsWith("|")) first--;
	const rows = whole.slice(first);
	const row = writing.trimStart().startsWith("|");
	if (rows.length === 0) return row ? end - writing.length : undefined;
	if (rows.length === 1) return row || writing === "" ? lines.slice(0, first).reduce((at, l) => at + l.length + 1, 0) : undefined;
	return TABLE_RULE.test(rows[1]!) && row ? end - writing.length : undefined;
}

/** Where an inline span left open in `line` starts (code, strong or emphasis, or a link), or undefined. */
function openSpan(line: string): number | undefined {
	let code: { at: number; run: number } | undefined;
	let strong: number | undefined;
	let em: number | undefined;
	let link: number | undefined;
	for (let i = 0; i < line.length; ) {
		const c = line[i]!;
		if (c === "`") {
			let j = i;
			while (line[j] === "`") j++;
			if (code === undefined) code = { at: i, run: j - i };
			else if (code.run === j - i) code = undefined;
			i = j;
			continue;
		}
		if (code !== undefined) {
			i++;
			continue;
		}
		if (c === "\\" && /[!-/:-@[-`{-~]/.test(line[i + 1] ?? "")) {
			// An escaped character is only text: it opens and closes nothing.
			i += 2;
			continue;
		}
		if (c === "*" && line[i + 1] === "*") {
			strong = strong === undefined ? i : undefined;
			i += 2;
			continue;
		}
		if (c === "*") {
			// Emphasis opens before a word and closes after one; a * between spaces is only a star.
			if (em === undefined && /\S/.test(line[i + 1] ?? " ") && !/\w/.test(line[i - 1] ?? " ")) em = i;
			else if (em !== undefined && /\S/.test(line[i - 1] ?? " ")) em = undefined;
		} else if (c === "[") link ??= i;
		else if (link !== undefined && c === "]" && line[i + 1] !== "(" && i + 1 < line.length) link = undefined;
		else if (link !== undefined && c === ")" && line.lastIndexOf("](", i) > link) link = undefined;
		i++;
	}
	const starts = [code?.at, strong, em, link].filter((at) => at !== undefined);
	return starts.length === 0 ? undefined : Math.min(...starts);
}
