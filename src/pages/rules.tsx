// Rules: your own say over what asks, across agents. Each rule allows or asks, for one agent or every agent, for a tool
// or a family by prefix, when the call's arguments meet its conditions, until it ends. Beside them, the grants that also
// let calls through without asking, each changed where it lives. A rule is made here, from scratch or from an approval
// card's "make a rule", which fills the form in from the request, or its "Trust <folder>", which fills it in to let the
// agent's reads, writes and edits in a workspace folder through (folder trust, gaidin's `inside` condition).
import { PlusIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { INSIDE_TOOLS, type NewRule, post, type Rule, type RuleGrant } from "../api.ts";
import { ancestors, when } from "../format.ts";
import { queries, useAgents } from "../queries.ts";
import { Confirm, Empty, Page, SectionHead, useAttempt } from "./page.tsx";

/** What "make a rule" brings from a request: the tool, the agent, and its short arguments; "Trust" also the folder. */
export type Draft = { tool?: string; agent?: string; args?: Record<string, string>; folder?: string };

const OPS = ["equals", "one-of", "starts-with", "contains", "host", "inside"] as const;
/** The tools a rule with an inside condition can name. */
const INSIDE_RULE_TOOLS = [...INSIDE_TOOLS, "workspace_*"];
/** Whether a rule's tool, a name or a prefix ending in *, names `tool`, as gaidin matches it. */
const names = (pattern: string, tool: string) => (pattern.endsWith("*") ? tool.startsWith(pattern.slice(0, -1)) : pattern === tool);
type Op = (typeof OPS)[number];
/** A condition in the form. `from`: the folder a trust started at, which the folder can widen from and narrow back to. */
type Row = { arg: string; op: Op; value: string; on: boolean; from?: string };
const SPANS = [
	["never", "it ends when you remove it"],
	["1h", "for an hour"],
	["today", "until the end of today"],
	["1d", "for a day"],
	["7d", "for a week"],
] as const;
type Span = (typeof SPANS)[number][0];

/** The end a span means, from now. */
function untilOf(span: Span): number | undefined {
	const now = Date.now();
	if (span === "1h") return now + 3_600_000;
	if (span === "1d") return now + 86_400_000;
	if (span === "7d") return now + 7 * 86_400_000;
	if (span === "today") return new Date(new Date(now).setHours(23, 59, 59, 999)).getTime();
	return undefined;
}

/** A condition to offer for an argument: a URL's host, or its value. */
function rowFor(arg: string, value: string): Row {
	const url = URL.parse(value);
	return url !== null && (url.protocol === "https:" || url.protocol === "http:") ? { arg, op: "host", value: url.hostname, on: false } : { arg, op: "equals", value, on: false };
}

export function Rules({ draft }: { draft?: Draft }) {
	const { data } = useQuery(queries.rules);
	const [making, setMaking] = useState(draft?.tool !== undefined);
	return (
		<Page title="Rules">
			<section>
				<SectionHead title="Rules" count={data?.rules.length}>
					{!making && (
						<button className="plain" type="button" onClick={() => setMaking(true)}>
							<PlusIcon aria-hidden="true" />
							new rule
						</button>
					)}
				</SectionHead>
				<p className="page-note">
					A rule that asks makes a call ask whatever else would let it through. A rule that allows lets through a call that would ask, but never one that's refused, and never{" "}
					{data === undefined ? "loading tools, writing skills, new jobs or browser uploads" : data.floor.join(", ")}.
				</p>
				{making && <RuleForm draft={draft} floor={data?.floor ?? []} done={() => setMaking(false)} />}
				{data === undefined ? (
					<Empty>Loading…</Empty>
				) : data.rules.length === 0 ? (
					<Empty>No rules yet.</Empty>
				) : (
					<ul className="rows">
						{data.rules.map((rule) => (
							<RuleRow key={rule.id} rule={rule} />
						))}
					</ul>
				)}
			</section>
			<section>
				<SectionHead title="Grants" count={data?.grants.length} />
				<p className="page-note">Other things that let calls through without asking. Each is changed where it lives.</p>
				{data === undefined ? <Empty>Loading…</Empty> : data.grants.length === 0 ? <Empty>Nothing else lets calls through.</Empty> : <Grants grants={data.grants} />}
			</section>
		</Page>
	);
}

function RuleRow({ rule }: { rule: Rule }) {
	const queryClient = useQueryClient();
	const { byId } = useAgents();
	const conditions = (rule.when ?? []).map((c) => `${c.arg} ${c.op} ${Array.isArray(c.value) ? c.value.join(", ") : c.value}`);
	return (
		<li className="rule-row">
			<div className="title">
				<span className={`tag ${rule.effect}`}>{rule.effect}</span>
				<code>{rule.tool}</code>
				<span>for {rule.agent === undefined ? "every agent" : (byId.get(rule.agent)?.name ?? rule.agent)}</span>
				<span className="id">{rule.id}</span>
			</div>
			<p className="meta">
				{conditions.length === 0 ? "every call" : `when ${conditions.join(" and ")}`}
				{rule.effect === "allow" && <span> · {rule.afterOutside === true ? "even after outside text" : "until outside text is read"}</span>}
				{rule.until !== undefined && <span> · until {when.format(rule.until)}</span>}
			</p>
			{rule.note !== undefined && <p className="note">{rule.note}</p>}
			<div className="actions">
				<Confirm label="remove" run={() => post("/api/rules/remove", { id: rule.id }).then(() => queryClient.invalidateQueries({ queryKey: ["rules"] }))} />
			</div>
		</li>
	);
}

const GRANT: Record<RuleGrant["kind"], string> = { host: "fetches from", "act-host": "acts on", "connector-tool": "allowed tool", "workspace-hour": "workspace for an hour" };

function Grants({ grants }: { grants: RuleGrant[] }) {
	const { byId } = useAgents();
	return (
		<ul className="rows grants">
			{grants.map((grant) => {
				const agent = grant.agent === undefined ? undefined : byId.get(grant.agent);
				return (
					<li key={`${grant.kind}:${grant.agent ?? ""}:${grant.what}`} className="grant-row">
						<span className="kind">{GRANT[grant.kind]}</span>
						<code>{grant.what}</code>
						{agent !== undefined && <span>{agent.name}</span>}
						{grant.until !== undefined && <span className="hint">until {when.format(grant.until)}</span>}
						{grant.kind === "connector-tool" ? (
							<Link className="button-link" to="/connectors">
								change
							</Link>
						) : grant.kind !== "workspace-hour" && agent !== undefined ? (
							<Link className="button-link" to="/$agent/settings" params={{ agent: agent.id }}>
								change
							</Link>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}

function RuleForm({ draft, floor, done }: { draft?: Draft; floor: readonly string[]; done: () => void }) {
	const attempt = useAttempt();
	const queryClient = useQueryClient();
	const { agents } = useAgents();
	const [effect, setEffect] = useState<"allow" | "ask">("allow");
	const [agent, setAgent] = useState(draft?.agent ?? "");
	const [tool, setTool] = useState(draft?.tool ?? "");
	const [rows, setRows] = useState<Row[]>(() =>
		draft?.folder === undefined
			? Object.entries(draft?.args ?? {}).map(([arg, value]) => rowFor(arg, value))
			: [
					{ arg: "workspace", op: "equals", value: draft.args?.workspace ?? "", on: true },
					{ arg: "path", op: "inside", value: draft.folder, on: true, from: draft.folder },
				],
	);
	const [span, setSpan] = useState<Span>("never");
	const [afterOutside, setAfterOutside] = useState(false);
	const [note, setNote] = useState("");
	const floored = floor.includes(tool.trim());
	/** inside is offered on a path, for the workspace file tools only; a row that has it keeps showing it, for gaidin to refuse. */
	const offers = (row: Row) => OPS.filter((op) => op !== "inside" || row.op === "inside" || (row.arg.trim() === "path" && INSIDE_RULE_TOOLS.includes(tool.trim())));
	// An allow rule reaching workspace_run without a folder lets every command through, whatever the cwd.
	const runs = (floored ? "ask" : effect) === "allow" && names(tool.trim(), "workspace_run") && !rows.some((r) => r.on && r.op === "inside");
	const workspace = rows.find((r) => r.on && r.arg.trim() === "workspace" && r.op === "equals" && r.value.trim() !== "")?.value.trim();
	const who = agent === "" ? "every agent" : (agents.find((a) => a.id === agent)?.name ?? agent);
	const set = (i: number, change: Partial<Row>) => setRows((now) => now.map((row, at) => (at === i ? { ...row, ...change } : row)));

	async function save() {
		const rule: NewRule = { effect: floored ? "ask" : effect, tool: tool.trim() };
		if (agent !== "") rule.agent = agent;
		const conditions = rows.filter((r) => r.on && r.arg.trim() !== "").map((r) => ({ arg: r.arg.trim(), op: r.op, value: r.op === "one-of" ? r.value.split(",").map((v) => v.trim()) : r.value }));
		if (conditions.length > 0) rule.when = conditions;
		const until = untilOf(span);
		if (until !== undefined) rule.until = until;
		if (rule.effect === "allow" && afterOutside) rule.afterOutside = true;
		if (note.trim() !== "") rule.note = note.trim();
		const made = await attempt(async () => {
			await post("/api/rules/add", rule);
			await queryClient.invalidateQueries({ queryKey: ["rules"] });
		});
		if (made) done();
	}

	return (
		<form
			className="skill-form rule-form"
			onSubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<div className="form-field">
				<span className="form-label">
					<span>effect</span>
				</span>
				<div className="choices" role="group" aria-label="Effect">
					{(["allow", "ask"] as const).map((option) => (
						<button key={option} type="button" className={`choice${(floored ? "ask" : effect) === option ? " on" : ""}`} aria-pressed={(floored ? "ask" : effect) === option} disabled={floored && option === "allow"} onClick={() => setEffect(option)}>
							{option === "allow" ? "allow without asking" : "always ask"}
						</button>
					))}
				</div>
				{floored && <span className="hint">{tool.trim()} always asks; only an ask rule can name it.</span>}
			</div>
			<label className="form-field">
				<span className="form-label">
					<span>agent</span>
				</span>
				<select value={agent} onChange={(event) => setAgent(event.target.value)}>
					<option value="">every agent</option>
					{agents
						.filter((a) => a.archived === undefined)
						.map((a) => (
							<option key={a.id} value={a.id}>
								{a.name}
							</option>
						))}
				</select>
			</label>
			<label className="form-field">
				<span className="form-label">
					<span>tool</span>
					<span className="hint">a tool's name, or a prefix ending in * for a family, such as home_*</span>
				</span>
				<input value={tool} placeholder="home_intent__HassTurnOn" autoCapitalize="off" spellCheck={false} onChange={(event) => setTool(event.target.value)} />
			</label>
			<fieldset className="form-field conditions">
				<legend className="form-label">
					<span>only when</span>
					<span className="hint">ticked conditions must all hold; none ticked is every call</span>
				</legend>
				{rows.map((row, i) => (
					<div key={i} className="condition">
						<input type="checkbox" aria-label={`Use the condition on ${row.arg || "a new argument"}`} checked={row.on} onChange={(event) => set(i, { on: event.target.checked })} />
						<input className="arg" aria-label="Argument" value={row.arg} placeholder="argument" onChange={(event) => set(i, { arg: event.target.value, on: true })} />
						<select aria-label={`How ${row.arg || "it"} is matched`} value={row.op} onChange={(event) => set(i, { op: OPS.find((o) => o === event.target.value) ?? "equals", on: true })}>
							{offers(row).map((op) => (
								<option key={op} value={op}>
									{op}
								</option>
							))}
						</select>
						<input className="value" aria-label={`Value for ${row.arg || "it"}`} value={row.value} onChange={(event) => set(i, { value: event.target.value, on: true, from: undefined })} />
						{row.op === "inside" && ancestors(row.from ?? row.value).length > 1 && (
							<div className="widen" role="group" aria-label="Widen the folder">
								<span className="hint">widen to</span>
								{ancestors(row.from ?? row.value).map((up, n) => (
									<Fragment key={up.folder}>
										{n > 0 && (
											<span className="sep" aria-hidden="true">
												/
											</span>
										)}
										<button className="plain" type="button" aria-pressed={up.folder === row.value} title={up.folder} onClick={() => set(i, { value: up.folder, on: true })}>
											{up.name}
										</button>
									</Fragment>
								))}
							</div>
						)}
					</div>
				))}
				<button className="plain" type="button" onClick={() => setRows((now) => [...now, { arg: "", op: "equals", value: "", on: true }])}>
					<PlusIcon aria-hidden="true" />
					condition
				</button>
			</fieldset>
			<label className="form-field">
				<span className="form-label">
					<span>lasts</span>
				</span>
				<select value={span} onChange={(event) => setSpan(SPANS.find(([s]) => s === event.target.value)?.[0] ?? "never")}>
					{SPANS.map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
			</label>
			{effect === "allow" && !floored && (
				<label className="form-field check">
					<span>
						<input type="checkbox" checked={afterOutside} onChange={(event) => setAfterOutside(event.target.checked)} /> even after outside text
					</span>
					<span className="hint">
						Without it the rule stops once the agent has read a page or a tool's result, which could be steering it. A connector's own results count, so a rule for its tools
						usually needs this; with it, outside text can lead the agent to exactly the calls the rule allows.
					</span>
				</label>
			)}
			<label className="form-field">
				<span className="form-label">
					<span>note</span>
					<span className="hint">why, for the list and the timeline</span>
				</span>
				<input value={note} placeholder="lights" onChange={(event) => setNote(event.target.value)} />
			</label>
			<div className="form-bar">
				{runs && (
					<p className="warn-note" role="note">
						This lets {who} run any command on {workspace ?? "any of its workspaces"} without asking, whatever the cwd.
					</p>
				)}
				<button className="plain" type="button" onClick={done}>
					cancel
				</button>
				<button className="primary" type="submit" disabled={tool.trim() === ""}>
					make rule
				</button>
			</div>
		</form>
	);
}
