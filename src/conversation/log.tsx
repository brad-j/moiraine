// A conversation drawn as gaidin's console draws it (web/log.ts). Everything is a row: the time on the first row of an
// exchange, a label saying what kind of line it is, and the body. Thinking and tool calls fold to one line each.
import { createContext, type ReactNode, useContext, useState } from "react";
import type { Block, Entry, ToolResult } from "../api.ts";
import { argsSummary, isFields, isNumber, isText, shortStamp, splitStamp, textOf } from "../format.ts";
import { Markdown } from "../markdown.tsx";
import type { Transcript } from "../transcript.ts";

/** A line of the log. */
export type Line = { key: string; kind: string; label: string; body: ReactNode; start?: boolean; time?: string; title?: string };
/** Command output and errors, shown after the entry they followed. */
export type Local = Line & { after: number };

export type LogOptions = {
	/** Who the user messages are from: the owner ("you"), a job's prompts or another agent's. */
	prompts?: "job" | "agent";
	/** Buttons beside a fired reminder. */
	reminderActions?: (taskId: number) => ReactNode;
};

/** The folds the owner has opened, by key, so they stay open as the log is drawn again. */
const Opened = createContext<Set<string>>(new Set());

export function Log(props: { transcript: Transcript; include: (entry: Entry) => boolean; local?: readonly Local[]; options?: LogOptions; empty?: ReactNode }) {
	const [opened] = useState(() => new Set<string>());
	const lines = linesOf(props.transcript, props.include, props.local ?? [], props.options ?? {});
	return (
		<Opened.Provider value={opened}>
			{lines.length === 0 ? props.empty : lines.map(({ key, ...line }) => <Row key={key} {...line} />)}
		</Opened.Provider>
	);
}

export function Row({ kind, label, body, start, time, title }: Omit<Line, "key">) {
	return (
		<div className={`row ${kind}${start ? " start" : ""}`}>
			<span className="t" title={title}>
				{time}
			</span>
			<span className="k">{label}</span>
			<div className={`b${kind === "gaidin" ? " prose" : ""}`}>{body}</div>
		</div>
	);
}

/** Thinking or a tool call in a line, opened for all of it. The body is built only when it's open. */
function Fold({ id, summary, sections, tail }: { id: string; summary: ReactNode; sections: [string | undefined, string][]; tail?: string }) {
	const opened = useContext(Opened);
	const [open, setOpen] = useState(opened.has(id));
	return (
		<>
			<details
				open={open}
				onToggle={(event) => {
					const now = event.currentTarget.open;
					if (now) opened.add(id);
					else opened.delete(id);
					setOpen(now);
				}}
			>
				<summary>{summary}</summary>
				{open && (
					<div className="fold">
						{sections.map(([label, text], n) => (
							<div key={n}>
								{label && <div className="label">{label}</div>}
								<pre>{text}</pre>
							</div>
						))}
					</div>
				)}
			</details>
			{/* A running tool shows the end of its output without being opened. */}
			{tail !== undefined && !open && <pre className="tail">{tail}</pre>}
		</>
	);
}

function lastLines(text: string, count: number): string {
	return text.replace(/\s+$/, "").split("\n").slice(-count).join("\n");
}

function blockLines(transcript: Transcript, blocks: readonly Block[], key: string, results: Map<string, ToolResult>): Line[] {
	const out: Line[] = [];
	blocks.forEach((block, index) => {
		const id = `${key}:${index}`;
		if (block.type === "text" && block.text.trim() !== "") {
			out.push({ key: id, kind: "gaidin", label: "gaidin", body: <Markdown text={block.text} /> });
		} else if (block.type === "thinking") {
			// A model with thinking off can still send an empty block.
			if (!block.redacted && block.thinking.trim() === "") return;
			const preview = block.redacted ? "redacted" : block.thinking.replace(/\s+/g, " ").trim();
			const body = <Fold id={id} summary={<span className="args">{preview}</span>} sections={[[undefined, block.redacted ? "Redacted by the provider." : block.thinking]]} />;
			out.push({ key: id, kind: "think", label: "think", body });
		} else if (block.type === "toolCall") {
			const result = results.get(block.id);
			const slot = transcript.tools.get(block.id);
			const status = result ? (result.isError ? "error" : "done") : slot ? "running" : transcript.running ? "waiting" : "no result";
			const output = result ? textOf(result.content) : (slot?.output ?? "");
			const args = isFields(block.arguments) ? block.arguments : {};
			const sections: [string | undefined, string][] = [["input", block.name === "bash" && isText(args.command) ? args.command : JSON.stringify(args, null, 2)]];
			if (result || slot) sections.push(["output", output || "(no output)"]);
			const summary = (
				<>
					<span className="name">{block.name}</span>
					<span className="args">{argsSummary(block.name, args)}</span>
					<span className="state">{status}</span>
				</>
			);
			const tail = status === "running" && output.trim() !== "" ? lastLines(output, 6) : undefined;
			// Keyed by the call, so it stays open when the answer being written becomes an entry.
			out.push({ key: block.id, kind: `tool s-${status.replace(" ", "-")}`, label: "tool", body: <Fold id={block.id} summary={summary} sections={sections} tail={tail} /> });
		}
	});
	return out;
}

const PROMPTS = { job: "job", agent: "agent" } as const;

function entryLines(transcript: Transcript, entry: Entry, results: Map<string, ToolResult>, before: Line | undefined, options: LogOptions): Line[] {
	const out: Line[] = [];
	const key = String(entry.id);
	let starts = false;
	let time: string | undefined;
	if (entry.kind === "gaidin.reminder-fired") {
		const data = isFields(entry.data) ? entry.data : {};
		starts = true;
		const body = (
			<>
				{String(data.text ?? "")}
				{!data.delivered && <span className="why">push failed: {String(data.error)}</span>}
				{isNumber(data.taskId) && options.reminderActions?.(data.taskId)}
			</>
		);
		out.push({ key, kind: "remind", label: "remind", body });
	}
	if (entry.kind === "gaidin.job-reported") {
		const data = isFields(entry.data) ? entry.data : {};
		starts = true;
		const body = (
			<>
				{String(data.title ?? "")}
				{!data.delivered && <span className="why">not delivered: {String(data.error)}</span>}
			</>
		);
		out.push({ key, kind: "job", label: "job", body }, { key: `${key}:report`, kind: "gaidin", label: "gaidin", body: <Markdown text={String(data.text ?? "")} /> });
	}
	// The note a stop leaves for the model says the same as the "Stopped." above it, and more.
	if (entry.kind === "gaidin.stopped") {
		const text = "Stopped. gaidin will drop that request unless you ask again.";
		if (before?.kind === "sys stopped") before.body = text;
		else out.push({ key, kind: "sys stopped", label: "sys", body: text });
		return out;
	}
	if (entry.kind === "pi.compaction") {
		// What the model reads from here on instead of the messages above.
		const summary = (entry.model ?? []).map((m) => (m.role === "user" ? textOf(m.content) : "")).join("\n").trim();
		const preview = <span className="args">Older messages summarised; the model reads this summary instead of them</span>;
		out.push({ key, kind: "think compacted", label: "summary", body: <Fold id={`${key}:summary`} summary={preview} sections={[[undefined, summary || "(no summary text)"]]} /> });
		return out;
	}
	for (const [n, message] of (entry.model ?? []).entries()) {
		if (message.role === "user") {
			const split = splitStamp(textOf(message.content));
			if (entry.kind === "pi.user") {
				starts = true;
				time = split.time;
				const prompts = options.prompts;
				out.push(prompts === undefined ? { key: `${key}:${n}`, kind: "you", label: "you", body: split.text } : { key: `${key}:${n}`, kind: "prompt", label: PROMPTS[prompts], body: split.text });
			} else out.push({ key: `${key}:${n}`, kind: "sys", label: "note", body: `${entry.kind}: ${split.text}` });
		} else if (message.role === "assistant") {
			out.push(...blockLines(transcript, message.content, key, results));
			if (message.stopReason === "error") out.push({ key: `${key}:error`, kind: "err", label: "error", body: message.errorMessage ?? "The model returned an error." });
			if (message.stopReason === "aborted") out.push({ key: `${key}:aborted`, kind: "sys stopped", label: "sys", body: "Stopped." });
		}
	}
	if (out.length > 0 && starts) {
		out[0]!.start = true;
		if (time !== undefined) {
			out[0]!.time = shortStamp(time);
			out[0]!.title = time;
		}
	}
	return out;
}

/**
 * The lines for `transcript`'s entries that `include` keeps, oldest first, with each of `local` placed after the
 * entry it followed, and the answer still coming in at the end.
 */
export function linesOf(transcript: Transcript, include: (entry: Entry) => boolean, local: readonly Local[], options: LogOptions): Line[] {
	const entries = [...transcript.entries.values()].sort((a, b) => a.id - b.id);
	const results = new Map<string, ToolResult>();
	for (const entry of entries) for (const m of entry.model ?? []) if (m.role === "toolResult") results.set(m.toolCallId, m);
	const lines: Line[] = [];
	let shown = 0;
	const flush = (upTo: number) => {
		while (shown < local.length && local[shown]!.after <= upTo) lines.push(local[shown++]!);
	};
	for (const entry of entries) {
		if (include(entry)) lines.push(...entryLines(transcript, entry, results, lines.at(-1), options));
		flush(entry.id);
	}
	if (transcript.partial !== undefined) lines.push(...blockLines(transcript, transcript.partial.content, "partial", results));
	flush(Infinity);
	return lines;
}
