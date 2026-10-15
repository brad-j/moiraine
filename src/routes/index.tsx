import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { problem } from "../api.ts";
import { queries } from "../queries.ts";

/** The app's start: the default agent's home conversation, which gaidin lists first. */
export const Route = createFileRoute("/")({ component: Start });

function Start() {
	const agents = useQuery(queries.agents);
	if (agents.data?.[0] !== undefined) return <Navigate to="/$agent" params={{ agent: agents.data[0].id }} replace />;
	return (
		<main className="page">
			<p className={agents.isError ? "page-problem" : undefined}>{agents.isError ? `Can't reach gaidin: ${problem(agents.error)}. Trying again.` : "Connecting…"}</p>
		</main>
	);
}
