import { createFileRoute } from "@tanstack/react-router";
import { SkillView } from "../pages/skills.tsx";
import { useAgent } from "../queries.ts";

/** One of a skill's files, by its path in the skill. `?create` opens an empty editor for a file being added. */
export const Route = createFileRoute("/$agent/skills/$name/$")({
	validateSearch: (search: Record<string, unknown>): { create?: boolean } => (search.create === true || search.create === "true" ? { create: true } : {}),
	component: Page,
});

function Page() {
	const { agent: id, name, _splat: file } = Route.useParams();
	const { create } = Route.useSearch();
	const agent = useAgent(id)!;
	return <SkillView agent={agent} name={name} file={file || undefined} create={create} />;
}
