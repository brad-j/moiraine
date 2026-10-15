import { createFileRoute } from "@tanstack/react-router";
import { Frame, useLastAgent } from "../frame.tsx";
import { TakeOver } from "../pages/browser.tsx";

/** A browser profile taken over, live, beside the sidebar of the agent shown last. A hand-over's notification opens it. */
export const Route = createFileRoute("/browser/$profile")({ component: Page });

function Page() {
	const { profile } = Route.useParams();
	const agent = useLastAgent();
	if (agent === undefined) return <p className="page-empty">Connecting…</p>;
	return (
		<Frame agent={agent}>
			<TakeOver key={profile} name={profile} />
		</Frame>
	);
}
