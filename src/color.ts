// An agent's color, which says which agent a thing is: the one its settings chose, from gaidin's AGENT_COLORS, or for
// an agent without one, the color at its place in the roster. It's set on an element as data-agent-color, which gives
// what's inside --agent (tokens.css); the app's controls keep the accent.
import type { Agent } from "./api.ts";
import { useAgents } from "./queries.ts";

export type AgentColor = NonNullable<Agent["color"]>;

/** Each color's name in words, in the order an agent without one takes them. tsc fails here when gaidin's list changes. */
export const COLORS: Record<AgentColor, string> = {
	ice: "Ice",
	blue: "Blue",
	violet: "Violet",
	orchid: "Orchid",
	pink: "Pink",
	teal: "Teal",
	lime: "Lime",
	silver: "Silver",
};
/** The colors in order. */
export const PALETTE = Object.keys(COLORS) as AgentColor[];

/** `agent`'s color, given the roster it's in. */
export function colorOf(agent: Pick<Agent, "id" | "color">, agents: readonly Pick<Agent, "id">[]): AgentColor {
	if (agent.color !== undefined) return agent.color;
	const place = agents.findIndex((a) => a.id === agent.id);
	return PALETTE[Math.max(0, place) % PALETTE.length]!;
}

/** `colorOf` for the roster as it is. */
export function useColorOf(): (agent: Pick<Agent, "id" | "color">) => AgentColor {
	const { agents } = useAgents();
	return (agent) => colorOf(agent, agents);
}
