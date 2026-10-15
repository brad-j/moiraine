import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { PROTOCOL } from "../api.ts";
import { queries, useAgent } from "../queries.ts";
import { Drawer, Sidebar } from "../sidebar.tsx";

/** An agent's conversations: the sidebar, and the conversation or page beside it. */
export const Route = createFileRoute("/$agent")({ component: AgentLayout });

function AgentLayout() {
	const { agent: id } = Route.useParams();
	const [open, setOpen] = useState(false);
	const agent = useAgent(id);
	if (agent === undefined) {
		return (
			<div className="missing">
				<p className="page-problem">There's no agent {id}.</p>
			</div>
		);
	}
	return (
		<Drawer.Provider value={{ open, toggle: (to) => setOpen((now) => to ?? !now) }}>
			<div id="app" className={open ? "drawer-open" : undefined}>
				<Sidebar agent={agent} />
				<button className="scrim" type="button" aria-label="Close the conversations" tabIndex={-1} onClick={() => setOpen(false)} />
				<div id="column">
					<VersionNotice />
					<Outlet />
				</div>
			</div>
		</Drawer.Provider>
	);
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
