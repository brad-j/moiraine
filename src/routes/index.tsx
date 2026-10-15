import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { problem } from "../api.ts";
import { queries } from "../queries.ts";

/** The app's start: the default agent's home conversation, which gaidin lists first. */
export const Route = createFileRoute("/")({ component: Start });

/** The web view's addresses (#/schedule, #/memory) and the default agent's page each opens here. */
const PAGES = { schedule: "/$agent/schedule", next: "/$agent/schedule", memory: "/$agent/memory" } as const;
const isPage = (name: string): name is keyof typeof PAGES => Object.hasOwn(PAGES, name);

function Start() {
	const agents = useQuery(queries.agents);
	const first = agents.data?.[0];
	if (first !== undefined) {
		const page = /^#\/([a-z]+)/.exec(location.hash)?.[1];
		const to = page !== undefined && isPage(page) ? PAGES[page] : "/$agent";
		return <Navigate to={to} params={{ agent: first.id }} hash="" replace />;
	}
	return (
		<main className="page">
			<p className={agents.isError ? "page-problem" : undefined}>{agents.isError ? `Can't reach gaidin: ${problem(agents.error)}. Trying again.` : "Connecting…"}</p>
		</main>
	);
}
