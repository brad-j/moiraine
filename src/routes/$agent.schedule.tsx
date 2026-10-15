import { createFileRoute } from "@tanstack/react-router";
import { Schedule } from "../pages/schedule.tsx";
import { useAgent } from "../queries.ts";

/** The agent's reminders and scheduled jobs. */
export const Route = createFileRoute("/$agent/schedule")({ component: Page });

function Page() {
	const { agent: id } = Route.useParams();
	const agent = useAgent(id)!;
	return <Schedule key={agent.id} agent={agent} />;
}
