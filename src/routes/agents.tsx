import { createFileRoute } from "@tanstack/react-router";
import { Frame, useLastAgent } from "../frame.tsx";
import { Agents } from "../pages/agents.tsx";

/** The roster, across agents, beside the sidebar of the agent shown last. */
export const Route = createFileRoute("/agents")({ component: Page });

function Page() {
	const agent = useLastAgent();
	if (agent === undefined) return <p className="page-empty">Connecting…</p>;
	return (
		<Frame agent={agent}>
			<Agents />
		</Frame>
	);
}
