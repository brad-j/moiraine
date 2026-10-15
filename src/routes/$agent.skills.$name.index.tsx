import { createFileRoute } from "@tanstack/react-router";
import { SkillView } from "../pages/skills.tsx";
import { useAgent } from "../queries.ts";

/** A skill, open at its SKILL.md. */
export const Route = createFileRoute("/$agent/skills/$name/")({ component: Page });

function Page() {
	const { agent: id, name } = Route.useParams();
	const agent = useAgent(id)!;
	return <SkillView agent={agent} name={name} />;
}
