// Activity, across agents: spend today and this month against the limits, spend by model, and the timeline of what
// the agents did outside their sandboxes and who allowed it, newest first, 50 at a time, each with its agent.
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Gets } from "../api.ts";
import { post } from "../api.ts";
import { argsSummary, clock, day, type Fields, isFields, money, when } from "../format.ts";
import { queries, useAgents } from "../queries.ts";
import { Action, Empty, Page, SectionHead } from "./page.tsx";

type Item = Gets["/api/timeline"]["items"][number];

export function Activity() {
	return (
		<Page title="Activity">
			<Spend />
			<Timeline />
		</Page>
	);
}

/** Spent against a limit, as a line and a bar; no limit, just the line. */
function Meter({ label, spent, limit }: { label: string; spent: number; limit: number }) {
	const share = limit > 0 ? spent / limit : 0;
	const tone = share >= 1 ? " over" : share >= 0.8 ? " near" : "";
	return (
		<div className="meter">
			<div className="figures">
				<span className="label">{label}</span>
				<span className={`amount${tone}`}>{money(spent)}</span>
				<span className="limit">{limit > 0 ? `of ${money(limit)}` : "no limit"}</span>
			</div>
			{limit > 0 && (
				<div className={`bar${tone}`} role="meter" aria-label={`${label}: ${money(spent)} of ${money(limit)}`} aria-valuenow={spent} aria-valuemin={0} aria-valuemax={limit}>
					<span style={{ transform: `scaleX(${Math.min(1, share)})` }} />
				</div>
			)}
		</div>
	);
}

const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

function Spend() {
	const queryClient = useQueryClient();
	const budget = useQuery(queries.budget);
	const usage = useQuery(queries.usage);
	// What the models and tools cost, in every conversation since gaidin started.
	const rows = Object.entries({ ...usage.data?.models, ...usage.data?.tools })
		.map(([key, u]) => ({ name: key.replace(/^[^/]+\//, ""), cost: u.cost.total, tokens: u.input + u.output + u.cacheRead + u.cacheWrite }))
		.filter((r) => r.cost > 0)
		.sort((a, b) => b.cost - a.cost);
	const status = budget.data;
	return (
		<section>
			<SectionHead title="Spend" />
			{budget.isPending ? (
				<Empty>Loading…</Empty>
			) : status == null ? (
				<Empty>No spend guard: the settings file sets no limits.</Empty>
			) : (
				<>
					{status.stopped && (
						<div className="stopped">
							<p>{status.reason ?? "The agents are stopped at the spend limit."}</p>
							<Action className="primary" run={() => post("/api/budget/allow", {}).then((allowed) => queryClient.setQueryData(queries.budget.queryKey, allowed))}>
								allow more today
							</Action>
						</div>
					)}
					<div className="meters">
						<Meter label="today" spent={status.today} limit={status.dailyLimit} />
						<Meter label="this month" spent={status.month} limit={status.monthlyLimit} />
					</div>
				</>
			)}
			{rows.length > 0 && (
				<table className="by-model">
					<thead>
						<tr>
							<th>all time, by model</th>
							<th>tokens</th>
							<th>cost</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.name}>
								<td>{row.name}</td>
								<td className="num">{compactNumber.format(row.tokens)}</td>
								<td className="num">{money(row.cost)}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</section>
	);
}

const GOOD = /^(ok|allowed once|always allowed|answered|reported|pushed)\b/;
const BAD = /^(denied|blocked|expired|not delivered|push failed)\b/;
const PLACES = { main: "", thread: "thread", job: "job run", agent: "from an agent" } as const;

/** A timeline item's tool call arguments, which gaidin's index keeps as JSON. */
function toolArguments(detail: string): Fields {
	try {
		const parsed: unknown = JSON.parse(detail);
		return isFields(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function Timeline() {
	const timeline = useInfiniteQuery(queries.timeline);
	const items = timeline.data?.pages.flatMap((page) => page.items) ?? [];
	// A line for each day, so the times can be short.
	const shown: ({ day: string } | Item)[] = [];
	let lastDay: string | undefined;
	for (const item of items) {
		const itemDay = item.at > 0 ? day(item.at) : "";
		if (itemDay !== lastDay) {
			lastDay = itemDay;
			shown.push({ day: itemDay === "" ? "earlier" : itemDay === "today" || itemDay === "tomorrow" ? itemDay : when.format(item.at).replace(/,? \d{2}:\d{2}$/, "") });
		}
		shown.push(item);
	}
	return (
		<section>
			<SectionHead title="Timeline" />
			<p className="page-note">What the agents did outside their sandboxes and who allowed it, newest first, in every conversation.</p>
			{timeline.isPending ? (
				<Empty>Loading…</Empty>
			) : items.length === 0 ? (
				<Empty>Nothing yet.</Empty>
			) : (
				<ol className="timeline-list">
					{shown.map((entry, n) => ("day" in entry ? <li key={`day:${n}`} className="day">{entry.day}</li> : <Event key={`${entry.entry}:${entry.kind}:${entry.name}:${n}`} item={entry} />))}
				</ol>
			)}
			{timeline.hasNextPage && <Action run={() => timeline.fetchNextPage()}>older</Action>}
		</section>
	);
}

function Event({ item }: { item: Item }) {
	const { byId } = useAgents();
	// "is-": the dock's approval cards already use the class "approval".
	const what = item.kind === "tool" ? item.name : item.kind === "approval" ? `allow ${item.name}?` : item.kind;
	const detail = item.kind === "tool" ? argsSummary(item.name, toolArguments(item.detail)) : item.kind === "job" ? item.name : item.detail;
	const outcome = item.outcome || "running";
	const tone = GOOD.test(outcome) ? "good" : BAD.test(outcome) || (item.kind === "tool" && outcome !== "running") ? "bad" : "";
	return (
		<li className={`event is-${item.kind}`}>
			<span className="time" title={item.at > 0 ? when.format(item.at) : undefined}>
				{item.at > 0 ? clock.format(item.at) : ""}
			</span>
			<span className="agent">{byId.get(item.agent)?.name ?? item.agent}</span>
			<div className="body">
				<div className="what">
					<span className="name">{what}</span>
					{PLACES[item.place] !== "" && <span className="tag">{PLACES[item.place]}</span>}
				</div>
				<div className="detail">{detail}</div>
			</div>
			<span className={`outcome ${tone}`}>{outcome}</span>
		</li>
	);
}
