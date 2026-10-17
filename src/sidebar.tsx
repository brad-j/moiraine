// The sidebar: a rail of the agents, each its picture and name, with a pulsing dot while it's working and an amber count
// of what waits on the owner, and System at its foot. Beside the rail, the agent's column: its name and job, its pages
// as a row of tabs, a search, and its home conversation above its threads, job runs and conversations other agents
// started, grouped by when they were last active. System puts the pages across agents in the column instead. The column
// collapses, leaving the rail; on a phone the whole sidebar is a drawer.
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useMatch } from "@tanstack/react-router";
import { ListIcon, MagnifyingGlassIcon, SidebarSimpleIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { type Agent, type Gets, problem } from "./api.ts";
import { Avatar } from "./avatar.tsx";
import { PLACES, placeOf } from "./conversation/view.tsx";
import { useColorOf } from "./color.ts";
import { ageGroup, lastSeen, oneLine, when } from "./format.ts";
import { waiting } from "./pages/connectors.tsx";
import { queries, troubled, useAgents } from "./queries.ts";

type Activity = Gets["/api/agents/activity"][number];

/**
 * The sidebar's state: on a phone, whether the drawer is open; on a wider screen, whether the agent's column is
 * collapsed to the rail.
 */
export const Drawer = createContext<{ open: boolean; toggle: (open?: boolean) => void; collapsed: boolean; collapse: () => void }>({
	open: false,
	toggle: () => {},
	collapsed: false,
	collapse: () => {},
});

/** The header's buttons for the sidebar: on a phone, the one that opens the drawer; wider, the one that collapses the column. */
export function MenuButton() {
	const { open, toggle, collapsed, collapse } = useContext(Drawer);
	return (
		<>
			<button id="menu-button" className="plain" type="button" aria-label="Conversations" aria-expanded={open} aria-controls="sidebar" onClick={() => toggle()}>
				<ListIcon size={20} />
			</button>
			<button
				id="collapse-button"
				className="plain"
				type="button"
				aria-label={collapsed ? "Show the sidebar" : "Hide the sidebar"}
				title={`${collapsed ? "Show" : "Hide"} the sidebar (Ctrl+B)`}
				aria-expanded={!collapsed}
				aria-controls="sidebar-column"
				onClick={collapse}
			>
				<SidebarSimpleIcon size={18} />
			</button>
		</>
	);
}

const SHOWN = "moiraine.conversations";

/** Each agent's conversation shown last in this tab, by agent: a thread's id, or none for its home. */
function shownConversations(): Record<string, number> {
	try {
		const shown: unknown = JSON.parse(sessionStorage.getItem(SHOWN) ?? "{}");
		return typeof shown === "object" && shown !== null ? (shown as Record<string, number>) : {};
	} catch {
		return {};
	}
}

/** Records the agent's conversation shown, `thread` or its home without one, for its entry in the rail to go back to. */
export function useShownConversation(agent: string, thread?: number) {
	useEffect(() => {
		const shown = shownConversations();
		if (thread === undefined) delete shown[agent];
		else shown[agent] = thread;
		sessionStorage.setItem(SHOWN, JSON.stringify(shown));
	}, [agent, thread]);
}

/** The pages across agents, which System shows in the column. */
const SYSTEM = ["/agents", "/connectors", "/rules", "/browser", "/activity"];
const onSystem = (path: string) => SYSTEM.some((page) => path === page || path.startsWith(`${page}/`));

export function Sidebar({ agent }: { agent: Agent }) {
	const { toggle } = useContext(Drawer);
	const close = () => toggle(false);
	const path = useLocation({ select: (location) => location.pathname });
	// The column shows System on a page across agents, and the agent's anywhere else, unless the rail chose otherwise here.
	const [chosen, choose] = useState<{ path: string; system: boolean }>();
	const system = chosen?.path === path ? chosen.system : onSystem(path);
	return (
		<nav id="sidebar" className={system ? "system" : undefined} aria-label="Conversations">
			<Rail current={agent} system={system} show={(to) => choose({ path, system: to })} />
			<div id="sidebar-column" className="column">
				{system ? <SystemPages onOpen={close} /> : <AgentColumn agent={agent} onOpen={close} />}
			</div>
		</nav>
	);
}

/**
 * Every agent but the archived ones, each going back to its conversation shown last, and System below them. The agent
 * whose conversation is open goes to its home, which is how to get there with the column collapsed.
 */
function Rail({ current, system, show }: { current: Agent; system: boolean; show: (system: boolean) => void }) {
	const { agents, fallback } = useAgents();
	const { data: approvals = [] } = useQuery(queries.approvals);
	const { data: activity = [] } = useQuery(queries.activity);
	const plugged = useSignIns();
	const colorOf = useColorOf();
	const byAgent = new Map(activity.map((a) => [a.agent, a]));
	const shown = agents.filter((a) => a.archived === undefined || a.id === current.id);
	const atHome = useMatch({ from: "/$agent/", shouldThrow: false });
	const inThread = useMatch({ from: "/$agent/t/$id", shouldThrow: false });
	const inConversation = atHome !== undefined || inThread !== undefined;
	const back = shownConversations();
	return (
		<div className="rail">
			<ul className="agents" role="group" aria-label="Agents">
				{shown.map((a) => (
					<li key={a.id} className={a.id === current.id ? "current" : undefined} data-agent-color={colorOf(a)}>
						<AgentLink
							agent={a}
							thread={a.id === current.id && inConversation ? undefined : back[a.id]}
							activity={byAgent.get(a.id)} waiting={approvals.filter((r) => (r.agent ?? fallback) === a.id).length} onOpen={() => show(false)} />
					</li>
				))}
			</ul>
			<button className="system" type="button" aria-pressed={system} onClick={() => show(!system)}>
				<span className="picture">
					<SquaresFourIcon size={18} aria-hidden="true" />
					{plugged > 0 && (
						<span className="waiting" title="A connector needs signing in, or has tools to look at">
							{plugged}
						</span>
					)}
				</span>
				<span className="name">System</span>
			</button>
		</div>
	);
}

/**
 * An agent in the rail, going to `thread` or its home: its picture and name; when it was last active and its newest
 * message, or that it's working, on hover.
 */
function AgentLink({ agent, thread, activity, waiting, onOpen }: { agent: Agent; thread: number | undefined; activity: Activity | undefined; waiting: number; onOpen: () => void }) {
	const last = activity?.last;
	// The owner's words, in the agent's home or a thread, start with "You:"; a job's prompt or another agent's are as they are.
	const yours = last?.role === "user" && (last.place === "main" || last.place === "thread");
	const preview = last === undefined ? agent.job || "No messages yet" : `${yours ? "You: " : ""}${oneLine(last.text)}`;
	const said = activity?.running ? "working…" : last === undefined ? preview : `${lastSeen(last.at)} · ${preview}`;
	const to = thread === undefined ? ({ to: "/$agent", params: { agent: agent.id } } as const) : ({ to: "/$agent/t/$id", params: { agent: agent.id, id: String(thread) } } as const);
	return (
		<Link className="agent" {...to} activeOptions={{ exact: true }} title={`${agent.name}: ${said}`} onClick={onOpen}>
			<span className="picture">
				<Avatar agent={agent} size="lg" />
				{activity?.running && (
					<span className="live">
						<span className="visually-hidden">working</span>
					</span>
				)}
				{waiting > 0 && (
					<span className="waiting" title={`${waiting} waiting on you`}>
						{waiting}
					</span>
				)}
			</span>
			<span className="name">{agent.name}</span>
		</Link>
	);
}

/** The agent's column: its name, job and New thread, its pages, a search, and its conversations. */
function AgentColumn({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
	const [search, setSearch] = useState("");
	return (
		<>
			<div className="column-head">
				<h2>{agent.name}</h2>
				{agent.job !== "" && (
					<span className="job" title={agent.job}>
						{agent.job}
					</span>
				)}
				<Link className="new-thread" to="/$agent/new" params={{ agent: agent.id }} aria-label="New thread" title={`New thread with ${agent.name}`} onClick={onOpen}>
					+ thread
				</Link>
			</div>
			<AgentPages agent={agent} onOpen={onOpen} />
			<label className="search">
				<MagnifyingGlassIcon aria-hidden="true" />
				<input type="search" value={search} placeholder="Search threads" aria-label="Search threads" onChange={(event) => setSearch(event.target.value)} />
			</label>
			<Threads agent={agent} search={search.trim().toLowerCase()} onOpen={onOpen} />
		</>
	);
}

/** The agent's pages, as tabs. The schedule's count turns to a warning when a job is paused or failing. */
function AgentPages({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
	const reminders = useQuery(queries.reminders(agent.id)).data ?? [];
	const jobs = useQuery(queries.jobs(agent.id)).data ?? [];
	const scheduled = reminders.length + jobs.length;
	const trouble = troubled(jobs);
	const tab = (to: "/$agent/schedule" | "/$agent/memory" | "/$agent/skills" | "/$agent/settings", children: ReactNode) => (
		<Link to={to} params={{ agent: agent.id }} onClick={onOpen}>
			{children}
		</Link>
	);
	return (
		<div className="tabs" role="group" aria-label="Pages">
			{tab(
				"/$agent/schedule",
				<>
					Schedule
					{scheduled > 0 && (
						<span className={`count${trouble > 0 ? " warn" : ""}`} title={trouble > 0 ? "A job is paused or failing" : undefined}>
							{scheduled}
						</span>
					)}
				</>,
			)}
			{tab("/$agent/memory", "Memory")}
			{tab("/$agent/skills", "Skills")}
			{tab("/$agent/settings", "Settings")}
		</div>
	);
}

/** How many of an agent's threads show before "show all". */
const FIRST = 5;

/** The agent's home, then its threads, job runs and conversations other agents started, the most recently active first. */
function Threads({ agent, search, onOpen }: { agent: Agent; search: string; onOpen: () => void }) {
	const list = useInfiniteQuery(queries.conversations(agent.id));
	const last = useQuery(queries.activity).data?.find((a) => a.agent === agent.id)?.last;
	const [all, setAll] = useState(false);
	const items = (list.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => search === "" || item.title.toLowerCase().includes(search));
	const shown = all || search !== "" ? items : items.slice(0, FIRST);
	const groups: [string, typeof shown][] = [];
	for (const item of shown) {
		const group = ageGroup(item.lastAt);
		if (groups.at(-1)?.[0] === group) groups.at(-1)![1].push(item);
		else groups.push([group, [item]]);
	}
	return (
		<div className="threads">
			<Link className="home" to="/$agent" params={{ agent: agent.id }} activeOptions={{ exact: true }} onClick={onOpen}>
				<span className="title">Home</span>
				{last?.place === "main" && (
					<span className="when" title={when.format(last.at)}>
						{lastSeen(last.at)}
					</span>
				)}
			</Link>
			{list.isPending && <p className="quiet">Loading…</p>}
			{list.isError && <p className="quiet problem">{problem(list.error)}</p>}
			{list.isSuccess && items.length === 0 && <p className="quiet">{search === "" ? "No threads yet." : "No thread has that."}</p>}
			{groups.map(([group, members]) => (
				<section key={group} aria-label={group}>
					<h3 className="day">{group}</h3>
					<ol>
						{members.map((item) => {
							const place = placeOf(item);
							return (
								<li key={item.id}>
									<Link className="thread" to="/$agent/t/$id" params={{ agent: agent.id, id: String(item.id) }} onClick={onOpen}>
										<span className="title">{item.title || "(no message)"}</span>
										<span className="when" title={when.format(item.lastAt)}>
											{lastSeen(item.lastAt)}
										</span>
										<span className={`origin ${place}`}>{PLACES[place]}</span>
									</Link>
								</li>
							);
						})}
					</ol>
				</section>
			))}
			{search === "" && (items.length > FIRST || list.hasNextPage) && (
				<button
					className="plain more"
					type="button"
					disabled={list.isFetchingNextPage}
					onClick={() => {
						if (!all) setAll(true);
						else void list.fetchNextPage();
					}}
				>
					{!all ? `show all${list.hasNextPage ? "" : ` ${items.length}`}` : "older"}
				</button>
			)}
		</div>
	);
}

/** The pages across agents, in the column when System is chosen. */
function SystemPages({ onOpen }: { onOpen: () => void }) {
	const { agents } = useAgents();
	const browsers = useQuery(queries.profiles).data?.names.length ?? 0;
	const plugged = useSignIns();
	const page = (to: "/agents" | "/connectors" | "/rules" | "/browser" | "/activity", name: string, hint?: ReactNode) => (
		<Link to={to} onClick={onOpen}>
			{name}
			{hint}
		</Link>
	);
	return (
		<>
			<div className="column-head">
				<h2>System</h2>
				<span className="job">every agent</span>
			</div>
			<div className="system-pages" role="group" aria-label="System">
				{page("/agents", "Agents", <span className="count">{agents.filter((a) => a.archived === undefined).length}</span>)}
				{page(
					"/connectors",
					"Connectors",
					plugged > 0 && (
						<span className="count warn" title="A connector needs signing in, or has tools to look at">
							{plugged}
						</span>
					),
				)}
				{page("/rules", "Rules")}
				{browsers > 0 && page("/browser", "Browser")}
				{page("/activity", "Activity")}
			</div>
		</>
	);
}

/** How many connectors wait on the owner: a sign-in, or tools to look at. */
function useSignIns(): number {
	return waiting(useQuery({ ...queries.connectors, refetchInterval: 60_000 }).data ?? []);
}
