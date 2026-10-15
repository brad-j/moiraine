import { createFileRoute } from "@tanstack/react-router";
import { Conversation } from "../conversation/view.tsx";
import { useAgent } from "../queries.ts";
import { MenuButton } from "../sidebar.tsx";

/** The agent's home conversation, pinned at the top of its list. `draft` starts the prompt with a request, as a page's "+ new reminder" does. */
export const Route = createFileRoute("/$agent/")({
	validateSearch: (search: Record<string, unknown>): { draft?: string } => (typeof search.draft === "string" ? { draft: search.draft } : {}),
	component: Home,
});

function Home() {
	const { agent: id } = Route.useParams();
	const { draft } = Route.useSearch();
	const agent = useAgent(id)!;
	return <Conversation key={agent.id} agent={agent} draft={draft} menu={<MenuButton />} />;
}
