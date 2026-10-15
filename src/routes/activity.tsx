import { createFileRoute } from "@tanstack/react-router";
import { Frame, useLastAgent } from "../frame.tsx";
import { Activity } from "../pages/activity.tsx";

/** Spend and the timeline, across agents, beside the sidebar of the agent shown last. */
export const Route = createFileRoute("/activity")({ component: Page });

function Page() {
	const agent = useLastAgent();
	if (agent === undefined) return <p className="page-empty">Connecting…</p>;
	return (
		<Frame agent={agent}>
			<Activity />
		</Frame>
	);
}
