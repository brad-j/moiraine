import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AgentFrame } from "../frame.tsx";

/** An agent's conversations and pages: its sidebar, and the conversation or page beside it. */
export const Route = createFileRoute("/$agent")({ component: AgentLayout });

function AgentLayout() {
	const { agent } = Route.useParams();
	return (
		<AgentFrame id={agent}>
			<Outlet />
		</AgentFrame>
	);
}
