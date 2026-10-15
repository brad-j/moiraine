// gaidin's GETs as queries, each keyed by what it's for: an agent, a conversation, or everything. Events from a
// conversation's stream invalidate the ones they affect (conversation/stream.ts).
import { infiniteQueryOptions, queryOptions, useQuery } from "@tanstack/react-query";
import { type Agent, type Gets, load } from "./api.ts";

const agentQuery = (agent: string) => `?agent=${encodeURIComponent(agent)}`;

export const queries = {
	version: queryOptions({ queryKey: ["version"], queryFn: () => load("/api/version"), staleTime: Infinity }),
	// Asked again until it's had, since nothing else can be shown right without it.
	agents: queryOptions({ queryKey: ["agents"], queryFn: () => load("/api/agents"), refetchInterval: (query) => (query.state.status === "error" ? 10_000 : false) }),
	// Every agent's, so the dock shows them all.
	approvals: queryOptions({ queryKey: ["approvals"], queryFn: () => load("/api/approvals"), refetchInterval: 60_000 }),
	budget: queryOptions({ queryKey: ["budget"], queryFn: () => load("/api/budget") }),
	usage: queryOptions({ queryKey: ["usage"], queryFn: () => load("/api/usage") }),
	settings: (agent: string) => queryOptions({ queryKey: ["settings", agent], queryFn: () => load("/api/settings", agentQuery(agent)) }),
	reminders: (agent: string) => queryOptions({ queryKey: ["reminders", agent], queryFn: () => load("/api/reminders", agentQuery(agent)), refetchInterval: 60_000 }),
	/** The shared notes and the agent's work notes. */
	memory: (agent: string) => queryOptions({ queryKey: ["memory", agent], queryFn: () => load("/api/memory", agentQuery(agent)) }),
	jobs: (agent: string) => queryOptions({ queryKey: ["jobs", agent], queryFn: () => load("/api/jobs", agentQuery(agent)), refetchInterval: 60_000 }),
	/** An agent's threads, job runs and conversations other agents started, the most recently active first, a page at a time. */
	conversations: (agent: string) =>
		infiniteQueryOptions({
			queryKey: ["conversations", agent],
			queryFn: ({ pageParam }) => load("/api/conversations", `${agentQuery(agent)}${pageParam === undefined ? "" : `&before=${pageParam}`}`),
			initialPageParam: undefined as number | undefined,
			getNextPageParam: (page) => page.next,
			refetchInterval: 60_000,
		}),
	conversation: (id: number) => queryOptions({ queryKey: ["conversation", id], queryFn: () => load("/api/conversation", `?id=${id}`), retry: false }),
};

/** Jobs that need the owner: paused, or failing. */
export function troubled(jobs: readonly Gets["/api/jobs"][number][]): number {
	return jobs.filter((j) => j.paused !== undefined || (j.failures ?? 0) > 0).length;
}

/** The roster, and the default agent, which gaidin lists first. `loaded` is false until the roster has come. */
export function useAgents(): { agents: Agent[]; byId: Map<string, Agent>; fallback: string | undefined; loaded: boolean } {
	const { data } = useQuery(queries.agents);
	const agents = data ?? [];
	return { agents, byId: new Map(agents.map((a) => [a.id, a])), fallback: agents[0]?.id, loaded: data !== undefined };
}

/** The agent `id`, or while the roster hasn't come, a stand-in by that id, so its conversation can connect. */
export function useAgent(id: string): Agent | undefined {
	const { byId, loaded } = useAgents();
	return byId.get(id) ?? (loaded ? undefined : { id, name: id, job: "", home: 0, hosts: [], canMessage: [], extensions: [], createdAt: 0 });
}
