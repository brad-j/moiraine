// The sidebar: a search, then the agents as a list, each with when it was last active and its newest message, or that
// it's working, and how many of its requests wait on the owner. The agent shown opens to its threads, job runs and
// conversations other agents started, the most recently active first. The pages are at the foot. On a phone it's a
// drawer.
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BrowserIcon, CalendarBlankIcon, GearSixIcon, type Icon, PlugsConnectedIcon, ListIcon, MagnifyingGlassIcon, NotebookIcon, NotePencilIcon, PulseIcon, PuzzlePieceIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { type Agent, type Gets, problem } from "./api.ts";
import { Avatar } from "./avatar.tsx";
import { Origin, PLACES, placeOf } from "./conversation/view.tsx";
import { lastSeen, oneLine, since, when } from "./format.ts";
import { waiting } from "./pages/connectors.tsx";
import { queries, troubled, useAgents } from "./queries.ts";

type Activity = Gets["/api/agents/activity"][number];

/** Opens and closes the drawer, on a phone. */
export const Drawer = createContext<{ open: boolean; toggle: (open?: boolean) => void }>({ open: false, toggle: () => {} });

/** The header's button that opens the sidebar on a phone; wider screens always show it. */
export function MenuButton() {
	const { open, toggle } = useContext(Drawer);
	return (
		<button id="menu-button" className="plain" type="button" aria-label="Conversations" aria-expanded={open} aria-controls="sidebar" onClick={() => toggle()}>
			<ListIcon size={20} />
		</button>
	);
}

export function Sidebar({ agent }: { agent: Agent }) {
	const { toggle } = useContext(Drawer);
	const close = () => toggle(false);
	const [search, setSearch] = useState("");
	return (
		<nav id="sidebar" aria-label="Conversations">
			<div className="sidebar-head">
				<label className="search">
					<MagnifyingGlassIcon aria-hidden="true" />
					<input type="search" value={search} placeholder="Search" aria-label="Search agents and threads" onChange={(event) => setSearch(event.target.value)} />
				</label>
				<Link className="new-thread" to="/$agent/new" params={{ agent: agent.id }} aria-label="New thread" title={`New thread with ${agent.name}`} onClick={close}>
					<NotePencilIcon size={18} aria-hidden="true" />
				</Link>
			</div>
			<Agents current={agent} search={search.trim().toLowerCase()} onOpen={close} />
			<Pages agent={agent} onOpen={close} />
		</nav>
	);
}

/**
 * Every agent but the archived ones, each going to its home conversation; the one the sidebar is for is marked and opens
 * to its threads. A search keeps the agents whose name or job has it, and always the one shown, whose threads it narrows.
 */
function Agents({ current, search, onOpen }: { current: Agent; search: string; onOpen: () => void }) {
	const { agents, fallback } = useAgents();
	const { data: approvals = [] } = useQuery(queries.approvals);
	const { data: activity = [] } = useQuery(queries.activity);
	const byAgent = new Map(activity.map((a) => [a.agent, a]));
	const matches = (a: Agent) => search === "" || a.name.toLowerCase().includes(search) || a.job.toLowerCase().includes(search);
	const shown = agents.filter((a) => (a.archived === undefined || a.id === current.id) && (matches(a) || a.id === current.id));
	return (
		<div className="agent-list">
			<ul className="agents" role="group" aria-label="Agents">
				{shown.map((a) => (
					<li key={a.id} className={a.id === current.id ? "current" : undefined}>
						<AgentRow agent={a} activity={byAgent.get(a.id)} waiting={approvals.filter((r) => (r.agent ?? fallback) === a.id).length} onOpen={onOpen} />
						{a.id === current.id && <Threads agent={a} search={search} onOpen={onOpen} />}
					</li>
				))}
			</ul>
		</div>
	);
}

/** An agent: its picture, name and when it was last active, then its newest message, or that it's working. */
function AgentRow({ agent, activity, waiting, onOpen }: { agent: Agent; activity: Activity | undefined; waiting: number; onOpen: () => void }) {
	const last = activity?.last;
	// The owner's words, in the agent's home or a thread, start with "You:"; a job's prompt or another agent's are as they are.
	const yours = last?.role === "user" && (last.place === "main" || last.place === "thread");
	const preview = last === undefined ? agent.job || "No messages yet" : `${yours ? "You: " : ""}${oneLine(last.text)}`;
	return (
		<Link className="agent" to="/$agent" params={{ agent: agent.id }} activeOptions={{ exact: true }} onClick={onOpen}>
			<Avatar agent={agent} size="lg" />
			<span className="lines">
				<span className="top">
					<span className="name">{agent.name}</span>
					{last !== undefined && (
						<span className="when" title={when.format(last.at)}>
							{lastSeen(last.at)}
						</span>
					)}
				</span>
				<span className="bottom">
					{activity?.running ? (
						<span className="working">
							<span className="live" aria-hidden="true" />
							working…
						</span>
					) : (
						<span className="preview">{preview}</span>
					)}
					{waiting > 0 && (
						<span className="waiting" title={`${waiting} waiting on you`}>
							{waiting}
						</span>
					)}
				</span>
			</span>
		</Link>
	);
}

/** How many of an agent's threads show before "show all". */
const FIRST = 5;

/** The agent's threads, job runs and conversations other agents started, beneath it: the newest few, or all of them. */
function Threads({ agent, search, onOpen }: { agent: Agent; search: string; onOpen: () => void }) {
	const list = useInfiniteQuery(queries.conversations(agent.id));
	const [all, setAll] = useState(false);
	const items = (list.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => search === "" || item.title.toLowerCase().includes(search));
	const shown = all || search !== "" ? items : items.slice(0, FIRST);
	return (
		<div className="threads">
			{list.isPending && <p className="quiet">Loading…</p>}
			{list.isError && <p className="quiet problem">{problem(list.error)}</p>}
			{list.isSuccess && items.length === 0 && <p className="quiet">{search === "" ? "No threads yet." : "No thread has that."}</p>}
			{shown.length > 0 && (
				<ol>
					{shown.map((item) => {
						const place = placeOf(item);
						return (
							<li key={item.id}>
								<Link className="thread" to="/$agent/t/$id" params={{ agent: agent.id, id: String(item.id) }} onClick={onOpen}>
									<span className="title">{item.title || "(no message)"}</span>
									<span className="meta">
										<span className={`origin ${place}`}>
											<Origin place={place} />
											{PLACES[place]}
										</span>
										<span title={when.format(item.lastAt)}>{since(item.lastAt)}</span>
									</span>
								</Link>
							</li>
						);
					})}
				</ol>
			)}
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

/** The pages at the sidebar's foot: the agent's own, then those across agents. The schedule's count turns to a warning when a job is paused or failing. */
function Pages({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
	const reminders = useQuery(queries.reminders(agent.id)).data ?? [];
	const jobs = useQuery(queries.jobs(agent.id)).data ?? [];
	const scheduled = reminders.length + jobs.length;
	const trouble = troubled(jobs);
	const browsers = useQuery(queries.profiles).data?.names.length ?? 0;
	// What waits on the owner there: a sign-in, or tools to look at.
	const plugged = waiting(useQuery({ ...queries.connectors, refetchInterval: 60_000 }).data ?? []);
	return (
		<div className="pages" role="group" aria-label="Pages">
			<Page to="/$agent/schedule" agent={agent} icon={CalendarBlankIcon} onOpen={onOpen}>
				Schedule
				{scheduled > 0 && (
					<span className={`count${trouble > 0 ? " warn" : ""}`} title={trouble > 0 ? "A job is paused or failing" : undefined}>
						{scheduled}
					</span>
				)}
			</Page>
			<Page to="/$agent/memory" agent={agent} icon={NotebookIcon} onOpen={onOpen}>
				Memory
			</Page>
			<Page to="/$agent/skills" agent={agent} icon={PuzzlePieceIcon} onOpen={onOpen}>
				Skills
			</Page>
			<Page to="/$agent/settings" agent={agent} icon={GearSixIcon} onOpen={onOpen}>
				Settings
			</Page>
			<span className="divider" aria-hidden="true" />
			<Page to="/agents" agent={agent} icon={UsersThreeIcon} onOpen={onOpen}>
				Agents
			</Page>
			<Page to="/connectors" agent={agent} icon={PlugsConnectedIcon} onOpen={onOpen}>
				Connectors
				{plugged > 0 && (
					<span className="count warn" title="A connector needs signing in, or has tools to look at">
						{plugged}
					</span>
				)}
			</Page>
			{browsers > 0 && (
				<Page to="/browser" agent={agent} icon={BrowserIcon} onOpen={onOpen}>
					Browser
				</Page>
			)}
			<Page to="/activity" agent={agent} icon={PulseIcon} onOpen={onOpen}>
				Activity
			</Page>
		</div>
	);
}

/** A link at the sidebar's foot, with its icon. */
function Page({ to, agent, icon: Glyph, onOpen, children }: { to: "/$agent/schedule" | "/$agent/memory" | "/$agent/skills" | "/$agent/settings" | "/agents" | "/connectors" | "/browser" | "/activity"; agent: Agent; icon: Icon; onOpen: () => void; children: ReactNode }) {
	return (
		<Link to={to} params={{ agent: agent.id }} onClick={onOpen}>
			<Glyph aria-hidden="true" />
			{children}
		</Link>
	);
}
