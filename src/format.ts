// Times, money and tool calls in words, and reading the owner's messages. From gaidin's web/dom.ts and web/log.ts.

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type Fields = { readonly [key: string]: Json };
export const isText = (value: unknown): value is string => typeof value === "string";
export const isNumber = (value: unknown): value is number => typeof value === "number";
export const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value);

export const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const when = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "in 25 min", "in 3 h 10 min", "in 4 days". */
export function fromNow(at: number): string {
	const minutes = Math.round((at - Date.now()) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `in ${minutes} min`;
	if (minutes < 48 * 60) return `in ${Math.floor(minutes / 60)} h${minutes % 60 === 0 ? "" : ` ${minutes % 60} min`}`;
	return `in ${Math.round(minutes / 1440)} days`;
}

export function money(dollars: number): string {
	return `$${dollars.toFixed(dollars < 1 ? 3 : 2)}`;
}

/** A tool call in a line: the command, path, URL or text it was given. */
export function argsSummary(name: string, args: Fields): string {
	if (name === "bash" && isText(args.command)) return args.command;
	if (/^(read|write|remove)_skill$/.test(name) && isText(args.name)) return `${args.name}/${isText(args.file) ? args.file : "SKILL.md"}`;
	if (isText(args.path)) return args.path;
	if (isText(args.url)) return args.url;
	if (name === "remind") return `${args.text ?? ""} ${args.at ?? (args.inMinutes === undefined ? "" : `in ${args.inMinutes} min`)}`;
	if (isText(args.title)) return args.title;
	if (isText(args.text)) return args.text;
	const json = JSON.stringify(args);
	return json === "{}" ? "" : json;
}

type Part = { type: string; text?: string };

export function textOf(content: string | readonly Part[]): string {
	return Array.isArray(content) ? content.map((p: Part) => p.text ?? `[${p.type}]`).join("") : String(content);
}

/** The owner's messages start with the local time in brackets; show it apart from the text. */
export function splitStamp(text: string): { time?: string; text: string } {
	const match = /^\[([^\]]+)\] /.exec(text);
	return match ? { time: match[1], text: text.slice(match[0].length) } : { text };
}

/** "Sat 2026-10-10 19:31 GMT-4" (gaidin's src/time.ts) as "19:31" today, or "Oct 10" another day. */
export function shortStamp(stamp: string): string {
	const match = /^\w+ (\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(stamp);
	if (!match) return stamp;
	const [, year, month, day, time] = match;
	const now = new Date();
	if (Number(year) === now.getFullYear() && Number(month) === now.getMonth() + 1 && Number(day) === now.getDate()) return time!;
	return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleString(undefined, { month: "short", day: "numeric" });
}

/** An agent's badge letter: the first of its name. */
export function initial(name: string): string {
	return (name.trim()[0] ?? "?").toUpperCase();
}

/** "just now", "25 min ago", "3 h ago", "4 days ago". */
export function ago(at: number): string {
	const minutes = Math.round((Date.now() - at) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h ago`;
	return `${Math.round(minutes / 1440)} days ago`;
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** "today", "tomorrow", a weekday within the week, or "Oct 20". */
export function day(at: number): string {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	const days = Math.floor((at - start.getTime()) / 86_400_000);
	return days === 0 ? "today" : days === 1 ? "tomorrow" : days > 1 && days < 7 ? weekday.format(at) : date.format(at);
}

type Said = string | readonly ({ type: string; text?: string; data?: string; mimeType?: string })[];

/**
 * An owner's message, apart: its text with the time stamp split off, the images that went with it, and where its other
 * files were saved, from the note gaidin adds (files.ts: "[Files from the app: a is saved as uploads/x (...); ...]").
 */
export function ownerMessage(content: Said): { time?: string; text: string; images: { data: string; mimeType: string }[]; files: string[] } {
	const parts = typeof content === "string" ? [{ type: "text", text: content }] : content;
	const whole = parts.map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("");
	const images = parts.flatMap((p) => (p.type === "image" && p.data !== undefined && p.mimeType !== undefined ? [{ data: p.data, mimeType: p.mimeType }] : []));
	const note = /\n\n\[Files from [^:]+: ([\s\S]*?)\. Read them with the file tools[\s\S]*\]$/.exec(whole);
	const { time, text } = splitStamp(note === null ? whole : whole.slice(0, note.index));
	return { time, text: text.trim(), images, files: note === null ? [] : note[1]!.split("; ") };
}

const yesterday = (at: number) => {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	return at < start.getTime() && at >= start.getTime() - 86_400_000;
};

/** When something last happened, short: the time today, "Yesterday", a weekday this week, or a date. */
export function lastSeen(at: number): string {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	if (at >= start.getTime()) return clock.format(at);
	if (yesterday(at)) return "Yesterday";
	return at >= start.getTime() - 6 * 86_400_000 ? weekday.format(at) : date.format(at);
}

/** The sidebar's group for something last active at `at`: today, the six days before, or older. */
export function ageGroup(at: number): "today" | "this week" | "older" {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	if (at >= start.getTime()) return "today";
	return at >= start.getTime() - 6 * 86_400_000 ? "this week" : "older";
}

/** A message on one line: no time stamp, no note of files, no runs of space. */
export function oneLine(text: string): string {
	return splitStamp(text).text.replace(/\n\n\[Files from [\s\S]*\]$/, "").replace(/\s+/g, " ").trim();
}
