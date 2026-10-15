import { createFileRoute } from "@tanstack/react-router";
import { Conversation } from "../conversation/view.tsx";
import { useAgent } from "../queries.ts";
import { MenuButton } from "../sidebar.tsx";

/** The agent's home conversation, pinned at the top of its list. */
export const Route = createFileRoute("/$agent/")({ component: Home });

function Home() {
	const { agent: id } = Route.useParams();
	const agent = useAgent(id)!;
	return <Conversation key={agent.id} agent={agent} menu={<MenuButton />} />;
}
