// The schedule: the agent's open reminders and scheduled jobs, soonest first. A job opens to its instruction and the
// reports it last sent, and pauses, resumes and cancels here. New ones are asked of the agent in its home
// conversation, so they go through its approvals.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { type Agent, type Gets, post } from "../api.ts";
import { ago, clock, day, fromNow, when } from "../format.ts";
import { Markdown } from "../markdown.tsx";
import { queries, useAgents } from "../queries.ts";
import { Action, Confirm, Empty, Page, SectionHead, useMinute } from "./page.tsx";

type Reminder = Gets["/api/reminders"][number];
type Job = Gets["/api/jobs"][number];

const RESULT = { reported: "reported", quiet: "nothing new", failed: "failed" } as const;

export function Schedule({ agent }: { agent: Agent }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const reminders = useQuery({ ...queries.reminders(agent.id), refetchInterval: 15_000 });
	const jobs = useQuery({ ...queries.jobs(agent.id), refetchInterval: 15_000 });
	const changed = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["reminders", agent.id] }), queryClient.invalidateQueries({ queryKey: ["jobs", agent.id] })]);
	// Asking for something new happens in the agent's home conversation, with the request started at the prompt.
	const ask = (draft: string) => void navigate({ to: "/$agent", params: { agent: agent.id }, search: { draft } });
	const sorted = [...(jobs.data ?? [])].sort((a, b) => (a.paused ? Infinity : (a.nextAt ?? Infinity)) - (b.paused ? Infinity : (b.nextAt ?? Infinity)));

	return (
		<Page title="Schedule" agent={agent}>
			<section>
				<SectionHead title="Reminders" count={reminders.data?.length}>
					<button className="plain" type="button" onClick={() => ask("Remind me to ")}>
						+ new reminder
					</button>
				</SectionHead>
				{reminders.isPending ? (
					<Empty>Loading…</Empty>
				) : (reminders.data ?? []).length === 0 ? (
					<Empty>No reminders. Ask {agent.name} for one, like “remind me to call the dentist at 3”.</Empty>
				) : (
					<ol className="rows">
						{reminders.data!.map((reminder) => (
							<ReminderRow key={reminder.taskId} reminder={reminder} changed={changed} />
						))}
					</ol>
				)}
			</section>
			<section>
				<SectionHead title="Jobs" count={jobs.data?.length}>
					<button className="plain" type="button" onClick={() => ask("Schedule a job: ")}>
						+ new job
					</button>
				</SectionHead>
				{jobs.isPending ? (
					<Empty>Loading…</Empty>
				) : sorted.length === 0 ? (
					<Empty>No scheduled jobs. Ask {agent.name} for a morning briefing, or a check every few hours that tells you only when something changes.</Empty>
				) : (
					<ol className="rows">
						{sorted.map((job) => (
							<JobRow key={job.taskId} job={job} changed={changed} />
						))}
					</ol>
				)}
			</section>
		</Page>
	);
}

/** When something is next due: the day and time, and how long from now. */
function Due({ at, fallback, tone = "" }: { at?: number; fallback: string; tone?: string }) {
	const now = useMinute();
	if (at === undefined) {
		return (
			<div className={`due ${tone}`}>
				<span className="at">{fallback}</span>
			</div>
		);
	}
	return (
		<div className={`due ${tone}${at - now < 3_600_000 ? " soon" : ""}`} title={when.format(at)}>
			<span className="at">
				{day(at)} {clock.format(at)}
			</span>
			<span className="in">{fromNow(at)}</span>
		</div>
	);
}

function ReminderRow({ reminder, changed }: { reminder: Reminder; changed: () => Promise<unknown> }) {
	return (
		<li className="sched-row">
			<Due at={reminder.at} fallback="" />
			<div className="body">
				<div className="title">{reminder.text}</div>
			</div>
			<div className="actions">
				<Confirm
					label="cancel"
					run={async () => {
						const { ok } = await post("/api/reminders/cancel", { id: reminder.taskId });
						await changed();
						if (!ok) throw new Error("That reminder was already gone.");
					}}
				/>
			</div>
		</li>
	);
}

function JobRow({ job, changed }: { job: Job; changed: () => Promise<unknown> }) {
	const [open, setOpen] = useState(false);
	const { byId } = useAgents();
	const meta: [string, string?][] = [];
	if (job.mode === "watch") meta.push(["watch", "tag"]);
	meta.push([job.when]);
	if (job.gate !== undefined) meta.push([`gate ${job.gate.name}`]);
	if (job.from !== undefined) meta.push([`from ${byId.get(job.from)?.name ?? job.from}`]);
	meta.push([`${job.runs} run${job.runs === 1 ? "" : "s"}${job.skipped ? `, ${job.skipped} skipped by the gate` : ""}`]);
	if (job.lastAt !== undefined) meta.push([`last ${ago(job.lastAt)}${job.lastResult ? `: ${RESULT[job.lastResult]}` : ""}`, job.lastResult === "failed" ? "bad" : undefined]);
	const reason = job.paused === undefined ? undefined : job.paused.reason.startsWith("paused") ? job.paused.reason : `paused after ${job.paused.reason}`;

	return (
		<li className={`sched-row job${job.paused ? " paused" : ""}`}>
			{job.paused ? <Due fallback="paused" tone="warn" /> : <Due at={job.nextAt} fallback="no next run" />}
			<div className="body">
				<button className="title toggle" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
					{job.title}
				</button>
				<div className="meta">
					{meta.map(([text, className]) => (
						<span key={text} className={className}>
							{text}
						</span>
					))}
				</div>
				{/* Why it needs the owner: "paused by the owner", or "5 failed runs in a row". */}
				{job.paused !== undefined ? (
					<div className="status warn">
						{reason} · {ago(job.paused.at)}
					</div>
				) : (
					(job.failures ?? 0) > 0 && (
						<div className="status bad">
							{job.failures} failed run{job.failures === 1 ? "" : "s"} in a row; it pauses after 5
						</div>
					)
				)}
				{open && <JobDetail job={job} />}
			</div>
			<div className="actions">
				{job.paused ? (
					<Action run={() => post("/api/jobs/resume", { id: job.taskId }).then(changed)}>resume</Action>
				) : (
					<Action run={() => post("/api/jobs/pause", { id: job.taskId }).then(changed)}>pause</Action>
				)}
				<Confirm
					label="cancel"
					run={async () => {
						const { ok } = await post("/api/jobs/cancel", { id: job.taskId });
						await changed();
						if (!ok) throw new Error("That job was already gone.");
					}}
				/>
			</div>
		</li>
	);
}

function JobDetail({ job }: { job: Job }) {
	const recent = [...(job.recent ?? [])].reverse();
	return (
		<div className="detail">
			<div className="label">instruction</div>
			<p className="instruction">{job.instruction}</p>
			{job.gate?.args !== undefined && (
				<>
					<div className="label">gate {job.gate.name} with</div>
					<pre>{JSON.stringify(job.gate.args, null, 2)}</pre>
				</>
			)}
			<div className="label">{recent.length === 0 ? "no reports yet" : `last ${recent.length === 1 ? "report" : `${recent.length} reports`}`}</div>
			{recent.map((report) => (
				<div key={report.at} className="report">
					<div className="stamp">
						{when.format(report.at)} · {ago(report.at)}
					</div>
					<Markdown text={report.text} />
				</div>
			))}
		</div>
	);
}
