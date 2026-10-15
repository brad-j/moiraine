// An agent's picture, or, without one, its initial on the accent's wash, drawn by CSS from data-initial so it adds no
// text to what it sits in. The picture's address carries its name, which changes with the picture, so gaidin lets the
// browser keep it.
import { type Agent, AVATAR_PATH } from "./api.ts";
import { initial } from "./format.ts";

export function Avatar({ agent, size = "md" }: { agent: Pick<Agent, "id" | "name" | "avatar">; size?: "sm" | "md" | "lg" | "xl" }) {
	if (agent.avatar !== undefined) {
		return <img className={`avatar ${size}`} src={`${AVATAR_PATH}?id=${encodeURIComponent(agent.id)}&v=${encodeURIComponent(agent.avatar)}`} alt="" draggable={false} />;
	}
	return <span className={`avatar monogram ${size}`} data-initial={initial(agent.name)} aria-hidden="true" />;
}
