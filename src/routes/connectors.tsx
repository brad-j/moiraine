import { createFileRoute } from "@tanstack/react-router";
import { Frame, useLastAgent } from "../frame.tsx";
import { Connectors } from "../pages/connectors.tsx";

/** The connectors, across agents, beside the sidebar of the agent shown last. A sign-in comes back here with `signed_in`. */
export const Route = createFileRoute("/connectors")({
	component: Page,
	validateSearch: (search: Record<string, unknown>): { signed_in?: string } => (typeof search.signed_in === "string" ? { signed_in: search.signed_in } : {}),
});

function Page() {
	const agent = useLastAgent();
	const { signed_in: signedIn } = Route.useSearch();
	if (agent === undefined) return <p className="page-empty">Connecting…</p>;
	return (
		<Frame agent={agent}>
			<Connectors signedIn={signedIn} />
		</Frame>
	);
}
