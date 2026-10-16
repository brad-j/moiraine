// Requests waiting on the owner, from every agent, as cards above the composer: a call to allow, like sudo asking
// first, a question from ask_owner, or a browser profile to take over. Alt+Y, Alt+A and Alt+N answer the oldest call.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type Approval, INSIDE_TOOLS, post, problem } from "../api.ts";
import { BrowserIcon, QuestionIcon, ShieldWarningIcon } from "@phosphor-icons/react";
import { Avatar } from "../avatar.tsx";
import { clock, folderOf, shortFolder, when } from "../format.ts";
import { queries, useAgents } from "../queries.ts";

type Decision = "once" | "always" | "deny";

export const alt = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥" : "Alt+";

/** The waiting requests, and answering them. */
export function useApprovals() {
	const queryClient = useQueryClient();
	const { data: approvals = [] } = useQuery(queries.approvals);
	const [busy, setBusy] = useState(false);
	/** The oldest request to allow a call; questions are answered and hand-overs done, not allowed. */
	const first = approvals.find((a) => a.kind === undefined);

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
							<Avatar agent={agent} size="sm" />
							{agent.name}
						</Link>
					) : (
						<Link className="who" to="/$agent/t/$id" params={{ agent: agent.id, id: String(request.conversationId) }} title={`${agent.name}'s thread`}>
							<Avatar agent={agent} size="sm" />
							{agent.name}
						</Link>
					);
				if (request.kind === "question") {
					return (
						<div key={request.id} className="approval question">
							<div className="ask">
								<div className="ask-head">
									{from}
									<span className="kind">
										<QuestionIcon aria-hidden="true" />
										asks
									</span>
								</div>
								<p className="what">{request.summary}</p>
							</div>
							<div className="buttons">
								{(request.choices ?? []).map((choice) => (
									<button key={choice} type="button" disabled={busy} onClick={() => attempt(() => answer(request, choice))}>
										{choice}
									</button>
								))}
								<span className="expires">
									{typed && <span className="typed">or type your answer below · </span>}
									waits until {when.format(request.expiresAt)}
								</span>
							</div>
						</div>
					);
				}
				if (request.kind === "handover") {
					const profile = request.profile ?? "";
					return (
						<div key={request.id} className="approval handover">
							<div className="ask">
								<div className="ask-head">
									{from}
									<span className="kind">
										<BrowserIcon aria-hidden="true" />
										asks you to take over
									</span>
									<code className="tool">{profile}</code>
								</div>
								<p className="what">{request.summary}</p>
							</div>
							<div className="buttons">
								<Link className="button-link take" to="/browser/$profile" params={{ profile }}>
									Take over
								</Link>
								<button type="button" disabled={busy} onClick={() => attempt(() => decide("once", request))}>
									Done
								</button>
								<button className="danger" type="button" disabled={busy} onClick={() => attempt(() => decide("deny", request))}>
									Can't
								</button>
								<span className="expires">waits until {when.format(request.expiresAt)}</span>
							</div>
						</div>
					);
				}
				const choices: [Decision, string, string, string][] = [["once", "Allow once", "primary", "Y"]];
				if (request.always !== undefined) choices.push(["always", request.always.label, "", "A"]);
				choices.push(["deny", "Deny", "danger", "N"]);
				// A workspace file's read, write or edit offers to trust the folder it's in, for that agent.
				const folder = INSIDE_TOOLS.includes(request.tool) && request.ruleArgs?.workspace !== undefined ? folderOf(request.ruleArgs.path ?? "") : undefined;
				return (
					<div key={request.id} className="approval">
						<div className="ask">
							<div className="ask-head">
								{from}
								<span className="kind">
									<ShieldWarningIcon aria-hidden="true" />
									wants to use
								</span>
								<code className="tool">{request.tool}</code>
							</div>
							<p className="what">{request.summary}</p>
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
							<Link className="button-link" to="/rules" search={{ tool: request.tool, agent: request.agent ?? fallback, args: JSON.stringify(request.ruleArgs ?? {}) }}>
								make a rule
							</Link>
							{folder !== undefined && (
								<Link
									className="button-link trust"
									to="/rules"
									search={{ tool: "workspace_*", agent: request.agent ?? fallback, args: JSON.stringify({ workspace: request.ruleArgs?.workspace }), folder }}
									title={`Let ${agent?.name ?? "the agent"} read, write and edit in ${folder} on ${request.ruleArgs?.workspace} without asking`}
								>
									Trust {shortFolder(folder)} for {agent?.name ?? request.agent ?? fallback}
								</Link>
							)}
							<span className="expires">waits until {clock.format(request.expiresAt)}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
