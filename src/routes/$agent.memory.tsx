import { createFileRoute } from "@tanstack/react-router";
import { Memory } from "../pages/memory.tsx";
import { useAgent } from "../queries.ts";

/** The shared notes and the agent's work notes. */
export const Route = createFileRoute("/$agent/memory")({ component: Page });

function Page() {
	const { agent: id } = Route.useParams();
	const agent = useAgent(id)!;
	return <Memory key={agent.id} agent={agent} />;
}
