// A conversation as gaidin's console has it (web/log.ts): your messages, the answers, and each tool call and stretch of
// thinking folded to a line. Two or more such steps in a row fold together into one line, open while one is running.
// Each line has a gutter, as a chat client's log does: the time an exchange started, and who wrote the line, the agent
// by name and a tool call by the tool's.
import { createContext, type ReactNode, useContext, useState } from "react";
import type { Agent, Block, Entry, ToolResult } from "../api.ts";
import { CaretRightIcon, CheckIcon, HourglassIcon, XIcon } from "@phosphor-icons/react";
import { argsSummary, isFields, isNumber, isText, ownerMessage, shortStamp, splitStamp, textOf } from "../format.ts";
import { Markdown } from "../markdown.tsx";
import type { Transcript } from "../transcript.ts";
import { settled, useReveal } from "./reveal.ts";

/** A line of the log. A tool call or thinking is a `step`, which gathers with the steps beside it. */
export type Line = { key: string; kind: string; label: string; body: ReactNode; start?: boolean; time?: string; title?: string; step?: { name: string; status: string } };
/** Command output and errors, shown after the entry they followed. */
export type Local = Line & { after: number };

export type LogOptions = {
	/** Who the user messages are from: the owner ("you"), a job's prompts or another agent's. */
	prompts?: "job" | "agent";
	/** Buttons beside a fired reminder. */
	reminderActions?: (taskId: number) => ReactNode;
	/** The agent answering, whose name is in the gutter beside its words. */
	speaker?: Pick<Agent, "name">;
};

/** The folds the owner has opened, by key, so they stay open as the log is drawn again. */
const Opened = createContext<Set<string>>(new Set());

/** `live`: with the answer being written at the end, or a line saying one's coming while the agent hasn't begun it. */
export function Log(props: { transcript: Transcript; include: (entry: Entry) => boolean; local?: readonly Local[]; options?: LogOptions; empty?: ReactNode; live?: boolean }) {
	const [opened] = useState(() => new Set<string>());
	const lines = linesOf(props.transcript, props.include, props.local ?? [], props.options ?? {}, props.live ?? false);
	const shown: ReactNode[] = [];
	const speaker = props.options?.speaker;
	for (let i = 0; i < lines.length; ) {
		let end = i;
		while (end < lines.length && lines[end]!.step !== undefined) end++;
		if (end - i >= 2) {
			const run = lines.slice(i, end);
			shown.push(<Steps key={`steps:${run[0]!.key}`} id={`steps:${run[0]!.key}`} lines={run} />);
			i = end;
		} else {
			const { key, ...line } = lines[i]!;
			shown.push(<Row key={key} {...line} label={line.kind === "gaidin" && speaker !== undefined ? speaker.name : line.label} />);
			i++;
		}
	}
	return <Opened.Provider value={opened}>{lines.length === 0 ? props.empty : shown}</Opened.Provider>;
}

/** A tool call's state as an icon: done, failed, or waiting to run. A running one has its pulsing dot instead. */
function State({ status }: { status: string }) {
	if (status === "done") return <CheckIcon weight="bold" aria-hidden="true" />;
	if (status === "error" || status === "no result") return <XIcon weight="bold" aria-hidden="true" />;
	if (status === "waiting") return <HourglassIcon aria-hidden="true" />;
	return null;
}

/** Steps in a row, as one line naming them; open by itself while one is running or waiting, until the owner toggles it. */
function Steps({ id, lines }: { id: string; lines: Line[] }) {
	const opened = useContext(Opened);
	const [toggled, setToggled] = useState<boolean | undefined>(opened.has(id) ? true : undefined);
	const statuses = lines.map((line) => line.step!.status);
	const live = statuses.includes("running") ? "running" : statuses.includes("waiting") ? "waiting" : undefined;
	const failed = statuses.filter((s) => s === "error" || s === "no result").length;
	const open = toggled ?? live !== undefined;
	const names = [...new Set(lines.map((line) => line.step!.name))];
	return (
		<div className={`row steps${live === undefined ? "" : ` s-${live}`}${failed > 0 ? " s-error" : ""}`}>
			<span className="t" />
			<span className="k">steps</span>
			<div className="b">
				<details
					open={open}
					onToggle={(event) => {
						const now = event.currentTarget.open;
						if (now === open) return;
						if (now) opened.add(id);
						else opened.delete(id);
						setToggled(now);
					}}
				>
					<summary>
						<CaretRightIcon className="caret" aria-hidden="true" />
						<span className="count">{lines.length} steps</span>
						<span className="args">{names.join(", ")}</span>
						<span className="state">{live ?? (failed > 0 ? `${failed} failed` : "done")}</span>
					</summary>
					{open && (
						<div className="step-list">
							{lines.map(({ key, ...line }) => (
								<Row key={key} {...line} />
							))}
						</div>
					)}
				</details>
			</div>
		</div>
	);
}

export function Row({ kind, label, body, start, time, title }: Omit<Line, "key">) {
	return (
		<div className={`row ${kind}${start ? " start" : ""}`}>
			<span className="t" title={title}>
				{time}
			</span>
			<span className="k" title={label}>
				{label}
			</span>
			<div className={`b${kind === "gaidin" ? " prose" : ""}`}>{body}</div>
		</div>
	);
}

/** A message to the agent: its text, the images that went with it, and where its other files were saved. */
function Said({ text, images, files }: ReturnType<typeof ownerMessage>) {
	return (
		<>
			{text !== "" && <span className="said">{text}</span>}
			{images.length > 0 && (
				<span className="images">
					{images.map((image, n) => (
						<img key={n} src={`data:${image.mimeType};base64,${image.data}`} alt={`Image ${n + 1} sent with the message`} />
					))}
				</span>
			)}
			{files.length > 0 && (
				<ul className="files-note">
					{files.map((file) => (
						<li key={file}>{file}</li>
					))}
				</ul>
			)}
		</>
	);
}

/** An answer's text. While it streams in it's shown at an even pace, a word at a time, rather than in the bursts it arrives in. */
function Answer({ text, live }: { text: string; live: boolean }) {
	const shown = useReveal(text, live);
	const writing = live || shown < text.length;
	return <Markdown text={writing ? settled(text, shown) : text} writing={writing} />;
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
				<summary>
					<CaretRightIcon className="caret" aria-hidden="true" />
					{summary}
				</summary>
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

/** The lines for an answer's blocks; `live` while it's being written. */
function blockLines(transcript: Transcript, blocks: readonly Block[], key: string, results: Map<string, ToolResult>, live: boolean): Line[] {
	const out: Line[] = [];
	blocks.forEach((block, index) => {
		const id = `${key}:${index}`;
		if (block.type === "text" && block.text.trim() !== "") {
			out.push({ key: id, kind: "gaidin", label: "gaidin", body: <Answer text={block.text} live={live} /> });
		} else if (block.type === "thinking") {
			// A model with thinking off can still send an empty block.
			if (!block.redacted && block.thinking.trim() === "") return;
			const preview = block.redacted ? "redacted" : block.thinking.replace(/\s+/g, " ").trim();
			const body = <Fold id={id} summary={<span className="args">{preview}</span>} sections={[[undefined, block.redacted ? "Redacted by the provider." : block.thinking]]} />;
			out.push({ key: id, kind: "think", label: "think", body, step: { name: "thinking", status: "done" } });
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
					<span className="args">{argsSummary(block.name, args)}</span>
					<span className="state">
						<State status={status} />
						{status}
					</span>
				</>
			);
			const tail = status === "running" && output.trim() !== "" ? lastLines(output, 6) : undefined;
			// Keyed by the call, so it stays open when the answer being written becomes an entry.
			out.push({ key: block.id, kind: `tool s-${status.replace(" ", "-")}`, label: block.name, body: <Fold id={block.id} summary={summary} sections={sections} tail={tail} />, step: { name: block.name, status } });
		}
	});
	return out;
}

const PROMPTS = { job: "job", agent: "agent" } as const;

/**
 * An answer's key: when its request started, which it has from its first word to its entry, so its lines are kept,
 * and stay open, as the answer being written becomes the entry; the entry's id without it.
 */
const answerKey = (message: { timestamp?: number }, fallback: string) => (message.timestamp === undefined ? fallback : `a${message.timestamp}`);

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
			if (entry.kind === "pi.user") {
				const said = ownerMessage(message.content);
				starts = true;
				time = said.time;
				const prompts = options.prompts;
				const body = <Said text={said.text} images={said.images} files={said.files} />;
				// What a speaker heard is from whoever was in the room, so it's labeled with the speaker.
				out.push(prompts === undefined ? { key: `${key}:${n}`, kind: "you", label: said.speaker ?? "you", body } : { key: `${key}:${n}`, kind: "prompt", label: PROMPTS[prompts], body });
			} else out.push({ key: `${key}:${n}`, kind: "sys", label: "note", body: `${entry.kind}: ${splitStamp(textOf(message.content)).text}` });
		} else if (message.role === "assistant") {
			out.push(...blockLines(transcript, message.content, answerKey(message, key), results, false));
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
 * entry it followed, and, when `live`, the answer still coming in at the end.
 */
export function linesOf(transcript: Transcript, include: (entry: Entry) => boolean, local: readonly Local[], options: LogOptions, live: boolean): Line[] {
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
	if (live && transcript.partial !== undefined) lines.push(...blockLines(transcript, transcript.partial.content, answerKey(transcript.partial, "partial"), results, true));
	// Sent, and the agent hasn't written anything back yet: its line, with the caret, so the owner sees it's begun.
	const last = lines.at(-1)?.kind;
	if (live && transcript.running && (last === "you" || last === "prompt")) lines.push({ key: "coming", kind: "gaidin", label: "gaidin", body: <Answer text="" live /> });
	flush(Infinity);
	// Two answers can't start in the same millisecond in one conversation, but a key given twice would mix up their lines.
	const keys = new Set<string>();
	return lines.map((line) => {
		let unique = line.key;
		while (keys.has(unique)) unique += "'";
		keys.add(unique);
		return unique === line.key ? line : { ...line, key: unique };
	});
}
