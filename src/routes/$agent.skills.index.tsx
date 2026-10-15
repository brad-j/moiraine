import { createFileRoute } from "@tanstack/react-router";
import { Skills } from "../pages/skills.tsx";
import { useAgent } from "../queries.ts";

/** The skills every agent can open. */
export const Route = createFileRoute("/$agent/skills/")({ component: Page });

function Page() {
	const { agent: id } = Route.useParams();
	const agent = useAgent(id)!;
	return <Skills agent={agent} />;
}
