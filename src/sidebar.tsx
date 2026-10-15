// The sidebar: the agent shown, its home conversation pinned, New thread, and its threads, job runs and conversations
// other agents started, the most recently active first, loading more as it scrolls. On a phone it's a drawer.
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createContext, useContext, useEffect, useRef } from "react";
import { type Agent, problem } from "./api.ts";
import { PLACES, placeOf } from "./conversation/view.tsx";
import { initial, since, when } from "./format.ts";
import { queries, troubled, useAgents } from "./queries.ts";

/** Opens and closes the drawer, on a phone. */
export const Drawer = createContext<{ open: boolean; toggle: (open?: boolean) => void }>({ open: false, toggle: () => {} });

/** The header's button that opens the sidebar on a phone; wider screens always show it. */
export function MenuButton() {
	const { open, toggle } = useContext(Drawer);
	return (
		<button id="menu-button" className="plain" type="button" aria-label="Conversations" aria-expanded={open} aria-controls="sidebar" onClick={() => toggle()}>
			☰
		</button>
	);
}

export function Sidebar({ agent }: { agent: Agent }) {
	const navigate = useNavigate();
	const { agents } = useAgents();
	const { toggle } = useContext(Drawer);
	const close = () => toggle(false);
	const shown = agents.filter((a) => a.archived === undefined || a.id === agent.id);
	return (
		<nav id="sidebar" aria-label="Conversations">
			{/* The agent's badge and name, with the native select over it, unseen, to pick another. */}
			<label className="switcher">
				<span className="badge" aria-hidden="true">
					{initial(agent.name)}
				</span>
				<span className="name" aria-hidden="true">
					{agent.name}
				</span>
				<span className="chevron" aria-hidden="true" />
				<span className="visually-hidden">Agent</span>
				<select value={agent.id} onChange={(event) => void navigate({ to: "/$agent", params: { agent: event.target.value } }).then(close)}>
					{shown.map((a) => (
						<option key={a.id} value={a.id}>
							{a.name}
							{a.archived === undefined ? "" : " (archived)"}
						</option>
					))}
				</select>
			</label>
			{agent.job !== "" && <p className="job">{agent.job}</p>}
			<div className="sidebar-actions">
				<Link className="pinned" to="/$agent" params={{ agent: agent.id }} activeOptions={{ exact: true }} onClick={close}>
					Home conversation
				</Link>
				<Link className="new-thread" to="/$agent/new" params={{ agent: agent.id }} onClick={close}>
					+ New thread
				</Link>
			</div>
			<Threads agent={agent} onOpen={close} />
			<Pages agent={agent} onOpen={close} />
		</nav>
	);
}

/** The agent's pages, at the sidebar's foot. The schedule's count turns to a warning when a job is paused or failing. */
function Pages({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
	const reminders = useQuery(queries.reminders(agent.id)).data ?? [];
	const jobs = useQuery(queries.jobs(agent.id)).data ?? [];
	const scheduled = reminders.length + jobs.length;
	const trouble = troubled(jobs);
	return (
		<div className="pages" role="group" aria-label="Pages">
			<Link to="/$agent/schedule" params={{ agent: agent.id }} onClick={onOpen}>
				Schedule
				{scheduled > 0 && (
					<span className={`count${trouble > 0 ? " warn" : ""}`} title={trouble > 0 ? "A job is paused or failing" : undefined}>
						{scheduled}
					</span>
				)}
			</Link>
			<Link to="/$agent/memory" params={{ agent: agent.id }} onClick={onOpen}>
				Memory
			</Link>
		</div>
	);
}

const ROW = 52;

function Threads({ agent, onOpen }: { agent: Agent; onOpen: () => void }) {
	const list = useInfiniteQuery(queries.conversations(agent.id));
	const items = list.data?.pages.flatMap((page) => page.items) ?? [];
	const scroller = useRef<HTMLDivElement>(null);
	// oxlint-disable-next-line react/incompatible-library -- the React Compiler can't memoize around it, and the app doesn't use the compiler
	const virtual = useVirtualizer({ count: items.length, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 8 });
	const shown = virtual.getVirtualItems();
	const last = shown.at(-1)?.index ?? -1;

	useEffect(() => {
		if (last >= items.length - 1 && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
	}, [last, items.length, list]);

	return (
		<>
			<h2>Threads</h2>
			<div className="threads" ref={scroller}>
				{list.isPending && <p className="quiet">Loading…</p>}
				{list.isError && <p className="quiet problem">{problem(list.error)}</p>}
				{list.isSuccess && items.length === 0 && <p className="quiet">No threads yet.</p>}
				<ol style={{ height: virtual.getTotalSize() }}>
					{shown.map((row) => {
						const item = items[row.index]!;
						const place = placeOf(item);
						return (
							<li key={item.id} style={{ transform: `translateY(${row.start}px)`, height: ROW }}>
								<Link className="thread" to="/$agent/t/$id" params={{ agent: agent.id, id: String(item.id) }} onClick={onOpen}>
									<span className="title">{item.title || "(no message)"}</span>
									<span className="meta">
										<span className={`origin ${place}`}>{PLACES[place]}</span>
										<span title={when.format(item.lastAt)}>{since(item.lastAt)}</span>
									</span>
								</Link>
							</li>
						);
					})}
				</ol>
			</div>
		</>
	);
}
