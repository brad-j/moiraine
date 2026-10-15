import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "../pages/settings.tsx";
import { useAgent } from "../queries.ts";

/** The agent's settings: its roster entry, model, tools, instructions and access, and the devices that get notifications. */
export const Route = createFileRoute("/$agent/settings")({ component: Page });

function Page() {
	const { agent: id } = Route.useParams();
	const agent = useAgent(id)!;
	return <Settings key={agent.id} agent={agent} />;
}
