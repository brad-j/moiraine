import { createFileRoute } from "@tanstack/react-router";
import { NewThread } from "../conversation/view.tsx";
import { useAgent } from "../queries.ts";
import { MenuButton } from "../sidebar.tsx";

/** A thread about to start with the agent. */
export const Route = createFileRoute("/$agent/new")({ component: New });

function New() {
	const { agent: id } = Route.useParams();
	const agent = useAgent(id)!;
	return <NewThread key={agent.id} agent={agent} menu={<MenuButton />} />;
}
