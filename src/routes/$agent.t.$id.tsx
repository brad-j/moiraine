import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { problem } from "../api.ts";
import { Conversation } from "../conversation/view.tsx";
import { queries, useAgent } from "../queries.ts";
import { MenuButton } from "../sidebar.tsx";

/** One of the agent's threads, job runs or conversations another agent started, which goes on from here. */
export const Route = createFileRoute("/$agent/t/$id")({ component: Thread });

function Thread() {
	const params = Route.useParams();
	const agent = useAgent(params.agent)!;
	const id = Number(params.id);
	const found = useQuery({ ...queries.conversation(id), enabled: Number.isInteger(id) && id > 0 });
	if (found.isError || !(Number.isInteger(id) && id > 0)) {
		return (
			<>
				<header className="convo-head">
					<MenuButton />
					<h1>Not found</h1>
				</header>
				<main className="page">
					<p className="page-problem">{found.isError ? problem(found.error) : `No conversation ${params.id}`}</p>
					<Link to="/$agent" params={{ agent: agent.id }}>
						{agent.name}'s home conversation
					</Link>
				</main>
			</>
		);
	}
	return <Conversation key={id} agent={agent} thread={{ id, summary: found.data?.conversation }} menu={<MenuButton />} />;
}
