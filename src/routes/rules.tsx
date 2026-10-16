import { createFileRoute } from "@tanstack/react-router";
import { Frame, useLastAgent } from "../frame.tsx";
import { type Draft, Rules } from "../pages/rules.tsx";

/** The short arguments an approval card brings, as JSON text, when they're an object of strings. */
function argsOf(value: unknown): Record<string, string> | undefined {
	if (typeof value !== "string") return undefined;
	try {
		const parsed: unknown = JSON.parse(value);
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
		const entries = Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string");
		return Object.fromEntries(entries);
	} catch {
		return undefined;
	}
}

/** The rules, across agents, beside the sidebar of the agent shown last. An approval card's "make a rule" fills in its form. */
export const Route = createFileRoute("/rules")({
	component: Page,
	validateSearch: (search: Record<string, unknown>): { tool?: string; agent?: string; args?: string } => {
		const found: { tool?: string; agent?: string; args?: string } = {};
		if (typeof search.tool === "string") found.tool = search.tool;
		if (typeof search.agent === "string") found.agent = search.agent;
		if (typeof search.args === "string") found.args = search.args;
		return found;
	},
});

function Page() {
	const agent = useLastAgent();
	const search = Route.useSearch();
	const draft: Draft = { tool: search.tool, agent: search.agent, args: argsOf(search.args) };
	if (agent === undefined) return <p className="page-empty">Connecting…</p>;
	return (
		<Frame agent={agent}>
			<Rules key={JSON.stringify(draft)} draft={draft} />
		</Frame>
	);
}
