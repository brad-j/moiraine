// Requests waiting on the owner, from every agent, docked above the prompt as in gaidin's console: a call to allow,
// like sudo asking first, or a question from ask_owner. Alt+Y, Alt+A and Alt+N answer the oldest call.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type Approval, post, problem } from "../api.ts";
import { clock, when } from "../format.ts";
import { queries, useAgents } from "../queries.ts";

type Decision = "once" | "always" | "deny";

export const alt = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥" : "Alt+";

/** The waiting requests, and answering them. */
export function useApprovals() {
	const queryClient = useQueryClient();
	const { data: approvals = [] } = useQuery(queries.approvals);
	const [busy, setBusy] = useState(false);
	/** The oldest request to allow a call; questions are answered, not allowed. */
	const first = approvals.find((a) => a.kind !== "question");

	async function settle(send: () => Promise<unknown>) {
		setBusy(true);
		try {
			await send();
		} finally {
			setBusy(false);
			await queryClient.invalidateQueries({ queryKey: ["approvals"] });
		}
	}

	/** Allows or denies `request`, the oldest call unless given. Throws when there's nothing to decide. */
	async function decide(decision: Decision, request = first) {
		if (request === undefined) throw new Error("Nothing is waiting for approval.");
		if (decision === "always" && request.always === undefined) throw new Error(`${request.tool} has no "always" choice.`);
		await settle(() => post("/api/approvals/decide", { id: request.id, decision }));
	}

	const answer = (request: Approval, text: string) => settle(() => post("/api/approvals/answer", { id: request.id, answer: text }));

	return { approvals, first, busy, decide, answer };
}

const SHORTCUTS = new Map<string, Decision>([["KeyY", "once"], ["KeyA", "always"], ["KeyN", "deny"]]);

export function Dock({ typed }: { /** The prompt is on screen to type an answer into. */ typed: boolean }) {
	const { approvals, first, busy, decide, answer } = useApprovals();
	const { byId, fallback } = useAgents();
	const [failed, setFailed] = useState<string>();
	const attempt = (work: () => Promise<unknown>) => {
		setFailed(undefined);
		work().catch((error) => setFailed(problem(error)));
	};

	useEffect(() => {
		const press = (event: KeyboardEvent) => {
			if (!event.altKey || event.ctrlKey || event.metaKey || first === undefined) return;
			const decision = SHORTCUTS.get(event.code);
			if (decision === undefined) return;
			event.preventDefault();
			attempt(() => decide(decision));
		};
		document.addEventListener("keydown", press);
		return () => document.removeEventListener("keydown", press);
	});

	return (
		<div id="approvals">
			{failed !== undefined && <p className="dock-problem">{failed}</p>}
			{approvals.map((request) => {
				const agent = byId.get(request.agent ?? fallback ?? "");
				// Where it came from: the agent's home, or one of its threads.
				const from =
					agent === undefined ? undefined : request.conversationId === agent.home ? (
						<Link className="who" to="/$agent" params={{ agent: agent.id }} title={`${agent.name}'s home conversation`}>
							{agent.name}
						</Link>
					) : (
						<Link className="who" to="/$agent/t/$id" params={{ agent: agent.id, id: String(request.conversationId) }} title={`${agent.name}'s thread`}>
							{agent.name}
						</Link>
					);
				if (request.kind === "question") {
					return (
						<div key={request.id} className="row approval question">
							<span className="t">{clock.format(request.createdAt)}</span>
							<span className="k">asks?</span>
							<div className="b">
								<div className="ask">
									{from}
									<span className="what">{request.summary}</span>
								</div>
								<div className="buttons">
									{(request.choices ?? []).map((choice) => (
										<button key={choice} type="button" disabled={busy} onClick={() => attempt(() => answer(request, choice))}>
											{choice}
										</button>
									))}
									<span className="expires">
										{typed && <span className="typed">type your answer below · </span>}
										waits until {when.format(request.expiresAt)}
									</span>
								</div>
							</div>
						</div>
					);
				}
				const choices: [Decision, string, string, string][] = [["once", "Allow once", "primary", "Y"]];
				if (request.always !== undefined) choices.push(["always", request.always.label, "", "A"]);
				choices.push(["deny", "Deny", "danger", "N"]);
				return (
					<div key={request.id} className="row approval">
						<span className="t">{clock.format(request.createdAt)}</span>
						<span className="k">allow?</span>
						<div className="b">
							<div className="ask">
								{from}
								<span className="tool">{request.tool}</span> <span className="what">{request.summary}</span>
								{request.detail !== undefined && (
									<details className="detail">
										<summary>all of it</summary>
										<pre>{request.detail}</pre>
									</details>
								)}
							</div>
							<div className="buttons">
								{choices.map(([decision, label, className, letter]) => (
									<button key={decision} className={className} type="button" disabled={busy} onClick={() => attempt(() => decide(decision, request))}>
										{label}
										{request === first && <kbd>{`${alt}${letter}`}</kbd>}
									</button>
								))}
								<span className="expires">waits until {clock.format(request.expiresAt)}</span>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
