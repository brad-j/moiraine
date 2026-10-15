// The app's frame: the sidebar for an agent, and beside it the column holding a conversation or a page. On a phone
// the sidebar is a drawer. The agent shown last is remembered, so the pages across agents keep its sidebar.
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { type Agent, PROTOCOL } from "./api.ts";
import { queries, useAgent, useAgents } from "./queries.ts";
import { Drawer, Sidebar } from "./sidebar.tsx";

const LAST = "moiraine.agent";

/** The agent to show beside the pages across agents: the one shown last, while it's still there, or the default. */
export function useLastAgent(): Agent | undefined {
	const { byId, fallback } = useAgents();
	const [last] = useState(() => (typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(LAST)));
	return byId.get(last ?? "") ?? byId.get(fallback ?? "");
}

export function Frame({ agent, children }: { agent: Agent; children: ReactNode }) {
	const [open, setOpen] = useState(false);
	useEffect(() => sessionStorage.setItem(LAST, agent.id), [agent.id]);
	return (
		<Drawer.Provider value={{ open, toggle: (to) => setOpen((now) => to ?? !now) }}>
			<div id="app" className={open ? "drawer-open" : undefined}>
				<Sidebar agent={agent} />
				<button className="scrim" type="button" aria-label="Close the conversations" tabIndex={-1} onClick={() => setOpen(false)} />
				<div id="column">
					<VersionNotice />
					{children}
				</div>
			</div>
		</Drawer.Provider>
	);
}

/** The frame for agent `id`, or says there's no such agent. */
export function AgentFrame({ id, children }: { id: string; children: ReactNode }) {
	const agent = useAgent(id);
	if (agent === undefined) {
		return (
			<div className="missing">
				<p className="page-problem">There's no agent {id}.</p>
			</div>
		);
	}
	return <Frame agent={agent}>{children}</Frame>;
}

/** Says so when gaidin speaks another protocol than this build was typed against: they're deployed separately. */
function VersionNotice() {
	const { data } = useQuery(queries.version);
	if (data === undefined || data.protocol === PROTOCOL) return null;
	return (
		<p className="version-notice">
			This app was built for gaidin's protocol {PROTOCOL}, and gaidin speaks {data.protocol}. Deploy a build of moiraine that matches it.
		</p>
	);
}
