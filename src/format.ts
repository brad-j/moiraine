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

/** "now", "25 min", "3 h", "4 d": how long ago, short enough for the sidebar. */
export function since(at: number): string {
	const minutes = Math.round((Date.now() - at) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes} min`;
	if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h`;
	return `${Math.round(minutes / 1440)} d`;
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
