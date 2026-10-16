// A conversation: an agent's home, one of its threads, or a thread about to start. The log, the dock and the prompt,
// with the status line under it, as gaidin's console has them.
import { ArrowDownIcon, ChatCircleIcon, ClockIcon, RobotIcon, SlackLogoIcon, StopIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Agent, type Entry, post, problem, requestId, type Summary } from "../api.ts";
import { fromNow, money, ownerMessage, when } from "../format.ts";
import { queries } from "../queries.ts";
import type { Transcript } from "../transcript.ts";
import { Avatar } from "../avatar.tsx";
import { alt, Dock, useApprovals } from "./dock.tsx";
import { type Local, Log, type LogOptions, Row } from "./log.tsx";
import { type Command, Prompt, type PromptHandle } from "./prompt.tsx";
import { useConversation } from "./stream.ts";

const LEVELS = ["off", "low", "medium", "high"] as const;

/** Where a conversation began, as its label says. */
export const PLACES = { slack: "Slack", app: "app", job: "job run", agent: "from an agent" } as const;
export const placeOf = (summary: Pick<Summary, "place" | "origin">) => (summary.place === "thread" ? (summary.origin ?? "slack") : summary.place);
const ORIGINS = { slack: SlackLogoIcon, app: ChatCircleIcon, job: ClockIcon, agent: RobotIcon } as const;

/** Where a conversation began, as an icon beside its label. */
export function Origin({ place }: { place: keyof typeof PLACES }) {
	const Glyph = ORIGINS[place];
	return <Glyph className="origin-icon" aria-hidden="true" />;
}

type Shown = {
	agent: Agent;
	/** A thread, job run or conversation another agent started; the agent's home without it. */
	thread?: { id: number; summary?: Omit<Summary, "startedAt" | "lastAt" | "messages"> };
	/** The header's left end: the sidebar's button on a phone. */
	menu: ReactNode;
	/** Text to start the prompt with, once: a request a page began, such as "Remind me to ". */
	draft?: string;
};

export function Conversation({ agent, thread, menu, draft }: Shown) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const id = thread?.id;
	const [local, setLocal] = useState<Local[]>([]);
	const sayAfter = useSay(setLocal);
	const conversation = useConversation({ agent: agent.id, conversation: id }, (event, now) => {
		if (event.type === "task_failed") sayAfter(lastEntry(now), "err", `${event.kind} failed: ${event.message}`);
	});
	const { transcript, connected, ready } = conversation;
	const say: Say = (kind, body) => sayAfter(lastEntry(transcript), kind, body);
	const prompt = useRef<PromptHandle>(null);
	const home = id === undefined;

	async function send(content: string, files: string[]) {
		try {
			const sent = await post("/api/message", { content, requestId: requestId(), agent: agent.id, conversation: id, files: files.length === 0 ? undefined : files });
			// gaidin takes a message as the answer when the agent is waiting on a question.
			if (sent.answered) say("sys", `Taken as the answer to ${agent.name}'s question; the run goes on.`);
			// A job run or another agent's conversation is forked, and the message went to the fork.
			if (id !== undefined && sent.conversation !== id) {
				void queryClient.invalidateQueries({ queryKey: ["conversations", agent.id] });
				void navigate({ to: "/$agent/t/$id", params: { agent: agent.id, id: String(sent.conversation) } });
			}
		} catch (error) {
			say("err", problem(error));
			throw error;
		}
	}

	async function stop(echo?: string) {
		if (echo) say("cmd", echo);
		if (!transcript.running) return say("sys", "Nothing is running.");
		try {
			await post("/api/abort", { agent: agent.id, conversation: id });
		} catch (error) {
			say("err", problem(error));
		}
	}

	// The draft goes in the prompt once, and leaves the address so a reload doesn't put it back.
	useEffect(() => {
		if (draft === undefined) return;
		prompt.current?.prefill(draft);
		void navigate({ to: "/$agent", params: { agent: agent.id }, search: {}, replace: true });
	}, [draft, agent.id, navigate]);

	const commands = useCommands({ agent, home, say, setLocal, stop, prefill: (text) => prompt.current?.prefill(text) });
	const summary = thread?.summary;
	const options: LogOptions = {
		speaker: agent,
		prompts: summary?.place === "job" ? "job" : summary?.place === "agent" ? "agent" : undefined,
		reminderActions: (taskId) => <Snooze id={taskId} say={say} />,
	};
	const forkedAt = summary?.forkedAt;
	const mine = (entry: Entry) => id === undefined || entry.conversationId === id;
	const { scroller, jump, toEnd, stick } = useStick(conversation, local);

	return (
		<>
			<header className="convo-head">
				{menu}
				{home && <Avatar agent={agent} />}
				{/* Blank while the thread's summary loads, rather than saying it has no message. */}
				<h1>{home ? agent.name : summary === undefined ? "" : summary.title || "(no message)"}</h1>
				{home ? (
					<span className="tag">home</span>
				) : (
					summary && (
						<span className={`tag ${summary.place}`}>
							<Origin place={placeOf(summary)} />
							{PLACES[placeOf(summary)]}
						</span>
					)
				)}
			</header>
			<main id="scroll" ref={scroller}>
				<div id="log" role="log" aria-live="polite" aria-relevant="additions">
					{forkedAt !== undefined && transcript.entries.has(forkedAt) && (
						<div className="replying">
							<div className="label">in reply to</div>
							<Log transcript={transcript} include={(entry) => entry.id === forkedAt} options={options} />
						</div>
					)}
					<Log
						transcript={transcript}
						include={mine}
						local={local}
						options={options}
						live
						// Said once there's a transcript, so a conversation being opened doesn't flash it.
						empty={ready && <Row kind="sys" label={agent.name} body={home ? "No messages yet. Type below, or / for commands." : "Nothing in it yet."} />}
					/>
				</div>
			</main>
			<footer id="dock">
				{jump && (
					<button id="jump" type="button" onClick={() => toEnd()}>
						<ArrowDownIcon aria-hidden="true" />
						new activity
					</button>
				)}
				<div id="dock-inner">
					<Dock typed />
					<Prompt
						ref={prompt}
						// gaidin posts what's sent here in the Slack thread too, then the answer.
						placeholder={summary !== undefined && placeOf(summary) === "slack" ? `Message ${agent.name}; it's posted in the Slack thread too` : `Message ${agent.name}, or type / for commands`}
						commands={commands}
						history={() => ownerMessages(transcript, mine)}
						send={(content, files) => {
							stick();
							return send(content, files);
						}}
						command={(line) => runCommand(commands, line, say)}
						running={transcript.running}
						stop={(echo) => void stop(echo)}
					>
						<StatusLine agent={agent} home={home} transcript={transcript} connected={connected} commands={commands} prefill={(text) => prompt.current?.prefill(text)} />
					</Prompt>
				</div>
			</footer>
			<Title agent={agent} running={transcript.running} />
		</>
	);
}

/** A thread with `agent` that starts when the first message is sent, with its home settings and none of its history. */
export function NewThread({ agent, menu }: Omit<Shown, "thread" | "draft">) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [problemText, setProblem] = useState<string>();
	return (
		<>
			<header className="convo-head">
				{menu}
				<Avatar agent={agent} />
				<h1>New thread</h1>
				<span className="tag">{agent.name}</span>
			</header>
			<main id="scroll">
				<div id="log" role="log">
					<Row kind="sys" label={agent.name} body={`A thread of its own: ${agent.name}'s settings and memory, none of its home conversation's history.`} />
					{problemText !== undefined && <Row kind="err" label="error" body={problemText} />}
				</div>
			</main>
			<footer id="dock">
				<div id="dock-inner">
					<Dock typed={false} />
					<Prompt
						placeholder={`Start a thread with ${agent.name}`}
						commands={[]}
						history={() => []}
						send={async (content, files) => {
							setProblem(undefined);
							try {
								const { conversation } = await post("/api/threads/start", { content, requestId: requestId(), agent: agent.id, files: files.length === 0 ? undefined : files });
								void queryClient.invalidateQueries({ queryKey: ["conversations", agent.id] });
								void navigate({ to: "/$agent/t/$id", params: { agent: agent.id, id: String(conversation) }, replace: true });
							} catch (error) {
								setProblem(problem(error));
								throw error;
							}
						}}
						command={async () => setProblem("Commands work in a conversation; send a message to start the thread.")}
						running={false}
						stop={() => {}}
					>
						<span className="status">new thread</span>
					</Prompt>
				</div>
			</footer>
			<Title agent={agent} running={false} />
		</>
	);
}

/** The page's title: what's waiting on the owner, or whether the agent is working. */
function Title({ agent, running }: { agent: Agent; running: boolean }) {
	const { approvals } = useApprovals();
	const asks = approvals.filter((a) => a.kind === "question").length;
	const allows = approvals.length - asks;
	const title = asks > 0 ? `(${asks}) question · ${agent.name}` : allows > 0 ? `(${allows}) approval · ${agent.name}` : running ? `working · ${agent.name}` : agent.name;
	useEffect(() => {
		document.title = title;
	}, [title]);
	return null;
}

type Say = (kind: "sys" | "err" | "cmd", body: ReactNode) => void;

function lastEntry(transcript: Transcript): number {
	let last = 0;
	for (const id of transcript.entries.keys()) if (id > last) last = id;
	return last;
}

/** Command output and errors in the log, after the entry they followed, until the page reloads or /clear. */
function useSay(setLocal: React.Dispatch<React.SetStateAction<Local[]>>): (after: number, ...said: Parameters<Say>) => void {
	const count = useRef(0);
	return (after, kind, body) => {
		const line: Local = { key: `local:${count.current++}`, after, kind, label: kind === "err" ? "error" : kind === "cmd" ? "you" : "sys", body };
		setLocal((lines) => {
			const previous = lines.at(-1);
			// The same error twice in a row is said once.
			if (kind === "err" && previous?.kind === "err" && typeof body === "string" && previous.body === body) return lines;
			return [...lines, line];
		});
	};
}

/** The owner's messages in the log, oldest first. */
function ownerMessages(transcript: Transcript, include: (entry: Entry) => boolean): string[] {
	return [...transcript.entries.values()]
		.filter((e) => e.kind === "pi.user" && include(e))
		.sort((a, b) => a.id - b.id)
		.flatMap((e) => (e.model ?? []).flatMap((m) => (m.role === "user" ? [ownerMessage(m.content).text] : [])))
		.filter((text) => text !== "");
}

/**
 * Keeps the log at its end while it's there, as a terminal does; scrolled up, new rows show the jump button instead.
 * `stick` keeps it there through the next draw, as after sending. It follows the log's size as well as the transcript,
 * so a card in the dock taking height from it, an image or font loading, an answer wrapping anew or being revealed
 * doesn't leave the end out of sight. A log that grew as it got narrower, as when the sidebar's column comes back, only
 * wrapped anew, so it doesn't show the jump button.
 */
function useStick(drawn: { transcript: Transcript }, local: readonly Local[]) {
	const scroller = useRef<HTMLElement>(null);
	const atEnd = useRef(true);
	const size = useRef({ height: 0, width: 0 });
	const [jump, setJump] = useState(false);
	/** After the log or its window changed size: to the end if it was there, or the jump button if there's more. */
	const follow = useCallback(() => {
		const el = scroller.current;
		if (el === null) return;
		if (atEnd.current) el.scrollTop = el.scrollHeight;
		else if (el.scrollHeight > size.current.height && el.clientWidth === size.current.width) setJump(true);
		size.current = { height: el.scrollHeight, width: el.clientWidth };
	}, []);
	// The transcript is changed in place, so it's each drawing of it that may have new rows.
	useLayoutEffect(follow, [drawn, local, follow]);
	useEffect(() => {
		const el = scroller.current;
		if (el === null) return;
		// Only scrolling up leaves the end. The log can grow between following it to the end and hearing that scroll, as
		// when an answer being revealed reaches a code block, and that isn't the owner scrolling away.
		let top = el.scrollTop;
		const scrolled = () => {
			if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) atEnd.current = true;
			else if (el.scrollTop < top) atEnd.current = false;
			top = el.scrollTop;
			if (atEnd.current) setJump(false);
		};
		el.addEventListener("scroll", scrolled, { passive: true });
		const resized = new ResizeObserver(follow);
		resized.observe(el);
		for (const child of el.children) resized.observe(child);
		return () => {
			el.removeEventListener("scroll", scrolled);
			resized.disconnect();
		};
	}, [follow]);
	return {
		scroller,
		jump,
		toEnd: () => {
			const el = scroller.current;
			if (el !== null) el.scrollTop = el.scrollHeight;
			setJump(false);
		},
		stick: () => {
			atEnd.current = true;
		},
	};
}

/** Buttons that set a fired reminder again, as its push and its Slack message do. */
function Snooze({ id, say }: { id: number; say: Say }) {
	const queryClient = useQueryClient();
	return (
		<span className="snooze">
			{([["snooze 10 min", 10], ["1 h", 60]] as const).map(([label, minutes]) => (
				<button
					key={minutes}
					className="plain"
					type="button"
					onClick={async () => {
						try {
							const { at } = await post("/api/reminders/snooze", { id, minutes });
							say("sys", `Snoozed until ${when.format(at)}.`);
							void queryClient.invalidateQueries({ queryKey: ["reminders"] });
						} catch (error) {
							say("err", problem(error));
						}
					}}
				>
					{label}
				</button>
			))}
		</span>
	);
}

function StatusLine(props: { agent: Agent; home: boolean; transcript: Transcript; connected: boolean; commands: readonly Command[]; prefill: (text: string) => void }) {
	const { transcript, home } = props;
	const settings = useQuery({ ...queries.settings(props.agent.id), enabled: home }).data;
	const budget = useQuery(queries.budget).data;
	const usage = useQuery(queries.usage).data;
	const run = (name: string) => void props.commands.find((c) => c.name === name)?.run("");

	// Idle says nothing; the line names a state only when it's worth looking at.
	let [label, tone] = ["", ""];
	if (!props.connected) [label, tone] = ["reconnecting", "problem"];
	else if (transcript.retry) [label, tone] = [transcript.retry, "problem"];
	else if (transcript.running) [label, tone] = ["working", "running"];

	const cost = (u: NonNullable<Transcript["usage"]>) => [...Object.values(u.models), ...Object.values(u.tools)].reduce((sum, x) => sum + (x.cost?.total ?? 0), 0);
	const here = transcript.usage === undefined ? undefined : cost(transcript.usage);
	// Today's spend against the daily limit when there's a budget; otherwise the totals.
	const total = budget
		? [budget.dailyLimit > 0 ? `${money(budget.today)} of ${money(budget.dailyLimit)} today` : `${money(budget.today)} today`, budget.monthlyLimit > 0 ? `${money(budget.month)} of ${money(budget.monthlyLimit)} month` : ""]
		: [usage === undefined ? "" : `${money(cost(usage))} all`];
	// One figure, the day's or the total; the conversation's and the month's are in its title.
	const spend = total[0] ?? "";
	const spendTitle = [here === undefined ? "" : `${money(here)} this conversation`, ...total.slice(1), budget?.reason ?? ""].filter((t) => t !== "").join(" · ");
	const near = budget != null && !budget.stopped && budget.dailyLimit > 0 && budget.today >= budget.dailyLimit * 0.8;

	// A thread keeps the settings it started with, which the commands don't change.
	const model = home ? settings?.model : transcript.agent?.model?.modelId;
	const thinking = home ? settings?.thinkingLevel : transcript.agent?.thinkingLevel;
	const off = settings?.tools.filter((t) => !t.enabled).map((t) => t.name) ?? [];

	return (
		<>
			{label !== "" && <span className={`status ${tone}`}>{label}</span>}
			{transcript.running && (
				<button className="plain seg danger" type="button" title="Stop the run (Esc or Ctrl+C)" onClick={() => run("stop")}>
					<StopIcon weight="fill" aria-hidden="true" />
					stop <kbd>esc</kbd>
				</button>
			)}
			{home && settings !== undefined ? (
				<>
					<button className="plain seg model" type="button" title={`Switch the model (/model); thinking ${settings.thinkingLevel} (/thinking)`} onClick={() => props.prefill("/model ")}>
						{settings.model}
					</button>
					{settings.thinkingLevel !== "off" && (
						<button className="plain seg thinking" type="button" title="Change the thinking level (/thinking)" onClick={() => props.prefill("/thinking ")}>
							thinking {settings.thinkingLevel}
						</button>
					)}
					{off.length > 0 && (
						<button className="plain seg tools" type="button" title="Switch a tool on or off (/tool)" onClick={() => props.prefill("/tool ")}>
							{off.join(" ")} off
						</button>
					)}
					{settings.instructions !== "" && (
						<button className="plain seg instructions" type="button" title="Standing instructions (/instructions)" onClick={() => run("instructions")}>
							instructions
						</button>
					)}
				</>
			) : (
				<>
					{model && <span className="fixed model" title="A thread keeps the model it started with">{model}</span>}
					{thinking && thinking !== "off" && <span className="fixed thinking">thinking {thinking}</span>}
				</>
			)}
			{budget?.stopped && (
				<button className="plain seg danger" type="button" title={budget.reason ?? "The spend limit is reached"} onClick={() => run("allow-more")}>
					stopped · allow more
				</button>
			)}
			{spend !== "" && (
				<span className={`spend${budget?.stopped ? " stopped" : near ? " near" : ""}`} title={spendTitle || undefined}>
					{spend}
				</span>
			)}
		</>
	);
}

async function runCommand(commands: readonly Command[], line: string, say: Say) {
	say("cmd", line);
	const [, name = "", arg = ""] = /^\/(\S*)\s*([\s\S]*)$/.exec(line) ?? [];
	const command = commands.find((c) => c.name === name);
	if (command === undefined) return say("err", `Unknown command /${name}. /help lists them.`);
	try {
		await command.run(arg.trim());
	} catch (error) {
		say("err", problem(error));
	}
}

/** The prompt's commands. The ones that change settings change the agent's, and are offered only in its home. */
function useCommands(context: { agent: Agent; home: boolean; say: Say; setLocal: (lines: Local[]) => void; stop: () => Promise<void>; prefill: (text: string) => void }): Command[] {
	const { agent, home, say } = context;
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const open = (to: "/$agent/schedule" | "/$agent/memory" | "/$agent/settings" | "/$agent/skills" | "/activity" | "/agents") => void navigate({ to, params: { agent: agent.id } });
	const settings = useQuery({ ...queries.settings(agent.id), enabled: home }).data;
	const reminders = useQuery(queries.reminders(agent.id)).data ?? [];
	const jobs = useQuery(queries.jobs(agent.id)).data ?? [];
	const { decide } = useApprovals();

	/** Saves the agent's settings with `change` applied. gaidin keeps any setting not given, except the switched-off tools, which it takes whole. */
	async function configure(change: { model?: string; thinkingLevel?: (typeof LEVELS)[number]; instructions?: string; disabledTools?: string[] }) {
		const current = settings ?? (await queryClient.fetchQuery(queries.settings(agent.id)));
		const saved = await post("/api/settings", { agent: agent.id, disabledTools: current.tools.filter((t) => !t.enabled).map((t) => t.name), ...change });
		queryClient.setQueryData(queries.settings(agent.id).queryKey, saved);
	}

	type Upcoming = { ref: string; kind: "reminder" | "job"; text: string; at?: number; paused?: boolean };
	const upcoming: Upcoming[] = [
		...reminders.map((r): Upcoming => ({ ref: `r${r.taskId}`, kind: "reminder", text: r.text, at: r.at })),
		// A paused job's runs are skipped, so it has no next run.
		...jobs.map((j): Upcoming => ({ ref: `j${j.taskId}`, kind: "job", text: j.title, at: j.paused === undefined ? j.nextAt : undefined, paused: j.paused !== undefined })),
	].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity));
	const refresh = () => queryClient.invalidateQueries({ queryKey: ["reminders", agent.id] }).then(() => queryClient.invalidateQueries({ queryKey: ["jobs", agent.id] }));

	async function cancel(ref: string) {
		const match = /^([rj])(\d+)$/.exec(ref);
		if (!match) throw new Error(`Give a reference, like r12 or j3 (Tab lists them), not "${ref}".`);
		const [, kind, id] = match;
		const { ok } = await post(kind === "r" ? "/api/reminders/cancel" : "/api/jobs/cancel", { id: Number(id) });
		await refresh();
		const what = kind === "r" ? "reminder" : "job";
		say(ok ? "sys" : "err", ok ? `Cancelled ${what} ${id}.` : `No open ${what} ${id}.`);
	}

	async function pause(ref: string, paused: boolean) {
		const match = /^j(\d+)$/.exec(ref);
		if (!match) throw new Error(`Give a job's reference, like j3 (Tab lists them), not "${ref}".`);
		const { ok } = await post(paused ? "/api/jobs/pause" : "/api/jobs/resume", { id: Number(match[1]) });
		await refresh();
		say(ok ? "sys" : "err", ok ? `${paused ? "Paused" : "Resumed"} job ${match[1]}.` : `No ${paused ? "running" : "paused"} job ${match[1]}.`);
	}

	const commands: Command[] = [
		{
			name: "help",
			help: "Commands and keys",
			run: () =>
				say(
					"sys",
					<div>
						<div className="help">
							{commands.map((c) => (
								<span key={c.name} style={{ display: "contents" }}>
									<span className="c">/{c.name}</span>
									<span className="a">{c.args ?? ""}</span>
									<span className="h">{c.help}</span>
								</span>
							))}
						</div>
						<div className="keys">
							Enter sends · Shift+Enter new line · ↑ ↓ history · Tab completes · Esc or Ctrl+C stops a run · {alt}Y {alt}A {alt}N answer an approval · start with // to send a message beginning with /
						</div>
					</div>,
				),
		},
		{ name: "stop", help: "Stop the current run (Esc, Ctrl+C)", run: () => context.stop() },
		{ name: "next", help: `${agent.name}'s reminders and scheduled jobs (the schedule page)`, run: () => open("/$agent/schedule") },
		{ name: "memory", help: `The shared notes and ${agent.name}'s work notes (the memory page)`, run: () => open("/$agent/memory") },
		{ name: "skills", help: "The guides every agent can open (the skills page)", run: () => open("/$agent/skills") },
		{ name: "settings", help: `${agent.name}'s settings, tools and access (the settings page)`, run: () => open("/$agent/settings") },
		{ name: "tools", help: "Switch tools on and off (the settings page)", run: () => open("/$agent/settings") },
		{ name: "notifications", help: "Notifications for this device and the others (the settings page)", run: () => open("/$agent/settings") },
		{ name: "timeline", help: "What the agents did and who allowed it (the activity page)", run: () => open("/activity") },
		{ name: "budget", help: "Spend today and this month, against the limits (the activity page)", run: () => open("/activity") },
		{ name: "agents", help: "The roster: make, archive and restore agents (the agents page)", run: () => open("/agents") },
		{
			name: "cancel",
			args: "<ref>",
			help: `Cancel one of ${agent.name}'s reminders or jobs by its reference (Tab lists them)`,
			complete: () => upcoming.map((i) => ({ value: i.ref, hint: `${i.text}${i.at === undefined ? "" : ` · ${fromNow(i.at)}`}` })),
			run: cancel,
		},
		{
			name: "pause",
			args: "<ref>",
			help: "Pause a job: its runs are skipped until you resume it",
			complete: () => upcoming.filter((i) => i.kind === "job" && !i.paused).map((i) => ({ value: i.ref, hint: i.text })),
			run: (arg) => pause(arg, true),
		},
		{
			name: "resume",
			args: "<ref>",
			help: "Resume a paused job from its next scheduled run",
			complete: () => upcoming.filter((i) => i.paused).map((i) => ({ value: i.ref, hint: i.text })),
			run: (arg) => pause(arg, false),
		},
		...(home ? homeCommands() : []),
		{
			name: "remember",
			args: "<text>",
			help: "Add a shared note, which every agent sees",
			run: async (arg) => {
				if (arg === "") throw new Error("Give the note's text: /remember the NAS is in the hall closet");
				const note = await post("/api/memory/add", { text: arg });
				say("sys", `Noted [${note.id}]: ${note.text}`);
			},
		},
		{
			name: "forget",
			args: "<id>",
			help: "Delete a shared note by its number",
			run: async (arg) => {
				const id = Number(arg);
				if (!Number.isInteger(id)) throw new Error("Give a note's number, like /forget 3.");
				const { ok } = await post("/api/memory/forget", { id });
				say(ok ? "sys" : "err", ok ? `Forgot note ${id}.` : `No note ${id}.`);
			},
		},
		{ name: "allow", help: `Allow the waiting request once (${alt}Y)`, run: () => decide("once") },
		{ name: "always", help: `Allow it from now on, where offered (${alt}A)`, run: () => decide("always") },
		{ name: "deny", help: `Deny the waiting request (${alt}N)`, run: () => decide("deny") },
		{
			name: "allow-more",
			help: "Allow another day's spend past the limit",
			run: async () => {
				const status = await post("/api/budget/allow", {});
				queryClient.setQueryData(queries.budget.queryKey, status);
				say("sys", `Allowed more today: the daily limit is now ${money(status.dailyLimit)}.`);
			},
		},
		{ name: "clear", help: "Clear command output from the screen", run: () => context.setLocal([]) },
	];

	function homeCommands(): Command[] {
		return [
			{
				name: "model",
				args: "[id]",
				help: `Show or switch ${agent.name}'s model`,
				complete: () => (settings?.models ?? []).map((m) => ({ value: m, hint: m === settings?.model ? "current" : undefined })),
				run: async (arg) => {
					if (arg === "") return say("sys", `Model ${settings?.model ?? "unknown"}. Choices: ${settings?.models.join(", ") ?? "none"}.`);
					await configure({ model: arg });
					say("sys", `Model set to ${arg}. Applies from the next request, and to new threads.`);
				},
			},
			{
				name: "thinking",
				args: "[level]",
				help: "Show or set the thinking level",
				complete: () => LEVELS.map((l) => ({ value: l, hint: l === settings?.thinkingLevel ? "current" : undefined })),
				run: async (arg) => {
					if (arg === "") return say("sys", `Thinking ${settings?.thinkingLevel ?? "unknown"}. Levels: ${LEVELS.join(", ")}.`);
					const level = LEVELS.find((l) => l === arg);
					if (level === undefined) return say("err", `No thinking level ${arg}. Levels: ${LEVELS.join(", ")}.`);
					await configure({ thinkingLevel: level });
					say("sys", `Thinking set to ${level}. Applies from the next request, and to new threads.`);
				},
			},
			{
				name: "tool",
				args: "<name> [on|off]",
				help: "Switch a tool on or off",
				complete: () => (settings?.tools ?? []).map((t) => ({ value: `${t.name} ${t.enabled ? "off" : "on"}`, hint: t.enabled ? "on now" : "off now" })),
				run: async (arg) => {
					const [name, setting] = arg.split(/\s+/);
					const current = settings ?? (await queryClient.fetchQuery(queries.settings(agent.id)));
					const tool = current.tools.find((t) => t.name === name);
					if (!tool) throw new Error(`No switchable tool "${name}". Tab lists them.`);
					const on = setting === undefined ? !tool.enabled : setting === "on";
					const disabled = new Set(current.tools.filter((t) => !t.enabled).map((t) => t.name));
					if (on) disabled.delete(tool.name);
					else disabled.add(tool.name);
					await configure({ disabledTools: [...disabled] });
					say("sys", `${tool.name} ${on ? "on" : "off"}. Applies from the next request.`);
				},
			},
			{
				name: "instructions",
				args: "[text | clear]",
				help: "Show or replace the standing instructions",
				run: async (arg) => {
					if (arg === "") return say("sys", settings?.instructions ? settings.instructions : "No standing instructions.");
					await configure({ instructions: arg === "clear" ? "" : arg });
					say("sys", arg === "clear" ? "Standing instructions cleared." : "Standing instructions saved. They apply from the next request.");
				},
			},
		];
	}

	return commands;
}
