// Connectors: the MCP servers gaidin uses, across agents. Each with its state (connected, needs signing in, can't be
// reached), its tools set to allow, ask or off with what they cost each request, and the tools that are new or changed
// since you set them, which are off until you set them again. Connect sends this tab to the service to sign in; it
// comes back here. Agents are given connectors on their settings pages.
import { PlusIcon } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type Connector, post } from "../api.ts";
import { ago } from "../format.ts";
import { queries, useAgents } from "../queries.ts";
import { Action, Confirm, Empty, Page, SectionHead, useAttempt } from "./page.tsx";
import { Choices } from "./settings.tsx";

type Tool = Connector["tools"][number];

const STATE: Record<Connector["state"], string> = { connected: "connected", "needs-owner": "needs signing in", unreachable: "can't be reached" };

/** Connectors that need you: signing in, or tools to look at. */
export const waiting = (connectors: readonly Connector[]) => connectors.filter((c) => c.state === "needs-owner" || c.tools.some((t) => t.review !== undefined)).length;

export function Connectors({ signedIn }: { signedIn?: string }) {
	const { data: connectors } = useQuery(queries.connectors);
	const [adding, setAdding] = useState(false);
	const just = connectors?.find((c) => c.name === signedIn);
	return (
		<Page title="Connectors">
			<section>
				<SectionHead title="Connectors" count={connectors?.length}>
					{!adding && (
						<button className="plain" type="button" onClick={() => setAdding(true)}>
							<PlusIcon aria-hidden="true" />
							add
						</button>
					)}
				</SectionHead>
				<p className="page-note">
					MCP servers whose tools agents can use: allow runs a tool without asking, ask asks you each time, off leaves it out. What they return counts as outside text. Give agents a
					connector on their settings pages.
				</p>
				{just !== undefined && (
					<p className={just.state === "connected" ? "page-note done" : "page-problem"}>
						{just.state === "connected" ? `${just.name} is signed in, with ${just.tools.length} ${just.tools.length === 1 ? "tool" : "tools"}.` : `${just.name} signed in, but ${just.problem ?? STATE[just.state]}.`}
					</p>
				)}
				{adding && <AddForm done={() => setAdding(false)} />}
				{connectors === undefined ? (
					<Empty>Loading…</Empty>
				) : connectors.length === 0 ? (
					<Empty>No connectors yet.</Empty>
				) : (
					<ul className="rows">
						{connectors.map((connector) => (
							<ConnectorRow key={connector.name} connector={connector} />
						))}
					</ul>
				)}
			</section>
		</Page>
	);
}

function ConnectorRow({ connector }: { connector: Connector }) {
	const queryClient = useQueryClient();
	const { agents } = useAgents();
	const [token, setToken] = useState<string>();
	const refresh = () => queryClient.invalidateQueries({ queryKey: ["connectors"] });
	const given = agents.filter((a) => a.connectors?.includes(connector.name)).map((a) => a.name);
	const reviews = connector.tools.filter((t) => t.review !== undefined);
	// Sign in in this tab; the service sends it back to this page.
	const connect = async () => window.location.assign((await post("/api/connectors/connect", { name: connector.name })).url);
	return (
		<li className="connector-row">
			<div className="title">
				<span className="name">{connector.name}</span>
				<span className={`tag ${connector.state}`}>{STATE[connector.state]}</span>
				{reviews.length > 0 && <span className="tag needs-owner">{reviews.length} to look at</span>}
			</div>
			<p className="meta">
				<code>{connector.url}</code>
				{connector.protocol !== undefined && <span> · MCP {connector.protocol}</span>}
				<span> · {connector.auth === "oauth" ? "signed in" : connector.auth === "token" ? "a token" : "no sign-in"}</span>
				<span> · about {connector.tokens} tokens a request</span>
				<span> · {given.length === 0 ? "no agent has it" : `given to ${given.join(", ")}`}</span>
				{connector.checkedAt !== undefined && <span> · checked {ago(connector.checkedAt)}</span>}
			</p>
			{connector.problem !== undefined && connector.state !== "connected" && <p className="problem">{connector.problem}</p>}
			<div className="actions">
				{connector.auth !== "token" && (
					<Action className={connector.state === "needs-owner" ? "primary" : "plain"} run={connect}>
						{connector.auth === "oauth" ? "sign in again" : "sign in"}
					</Action>
				)}
				<button className="plain" type="button" onClick={() => setToken(token === undefined ? "" : undefined)}>
					token
				</button>
				<Action run={() => post("/api/connectors/refresh", { name: connector.name }).then(refresh)}>refresh</Action>
				<Confirm label="remove" run={() => post("/api/connectors/remove", { name: connector.name }).then(() => queryClient.invalidateQueries())} />
			</div>
			{token !== undefined && (
				<form
					className="token-form"
					onSubmit={(event) => {
						event.preventDefault();
					}}
				>
					<input type="password" aria-label={`${connector.name}'s token`} placeholder="a token the service gave you, or empty to take it away" value={token} autoComplete="off" onChange={(event) => setToken(event.target.value)} />
					<Action
						className="primary"
						run={async () => {
							await post("/api/connectors/token", token.trim() === "" ? { name: connector.name } : { name: connector.name, token: token.trim() });
							setToken(undefined);
							await refresh();
						}}
					>
						save
					</Action>
				</form>
			)}
			{connector.tools.length > 0 && (
				<ul className="tools">
					{connector.tools.map((tool) => (
						<ToolRow key={tool.name} connector={connector.name} tool={tool} />
					))}
				</ul>
			)}
			{(connector.rejected ?? []).map((r) => (
				<p key={r.name} className="meta">
					<code>{r.name}</code> can't be offered: {r.problem}
				</p>
			))}
		</li>
	);
}

function ToolRow({ connector, tool }: { connector: string; tool: Tool }) {
	const queryClient = useQueryClient();
	const readOnly = tool.annotations?.readOnlyHint === true;
	return (
		<li className={`tool-row${tool.review === undefined ? "" : " review"}`}>
			<div className="about">
				<code className="tool">{tool.name}</code>
				{tool.review !== undefined && <span className="tag needs-owner">{tool.review}, off until you set it</span>}
				{readOnly && <span className="hint">says it only reads</span>}
				{tool.description !== undefined && <p className="description">{tool.description}</p>}
			</div>
			<Choices
				label={`${tool.name} on ${connector}`}
				options={["allow", "ask", "off"]}
				current={tool.review === undefined ? tool.setting : ""}
				choose={async (setting) => {
					await post("/api/connectors/tool", { name: connector, tool: tool.name, setting: setting === "allow" ? "allow" : setting === "ask" ? "ask" : "off" });
					await queryClient.invalidateQueries({ queryKey: ["connectors"] });
				}}
			/>
		</li>
	);
}

function AddForm({ done }: { done: () => void }) {
	const attempt = useAttempt();
	const queryClient = useQueryClient();
	const form = useForm({
		defaultValues: { name: "", url: "", token: "" },
		onSubmit: async ({ value }) => {
			const body = value.token.trim() === "" ? { name: value.name.trim(), url: value.url.trim() } : { name: value.name.trim(), url: value.url.trim(), token: value.token.trim() };
			const added = await attempt(async () => {
				await post("/api/connectors/add", body);
				await queryClient.invalidateQueries({ queryKey: ["connectors"] });
			});
			if (added) done();
		},
	});
	return (
		<form
			className="skill-form"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.Field name="name" validators={{ onChange: ({ value }) => (/^[a-z][a-z0-9-]{0,30}$/.test(value.trim()) ? undefined : "Lowercase letters, digits and -, starting with a letter.") }}>
				{(field) => (
					<label className="form-field">
						<span className="form-label">
							<span>name</span>
							<span className="hint">its tools are named name_tool</span>
						</span>
						<input value={field.state.value} placeholder="home" autoFocus autoCapitalize="off" spellCheck={false} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
						{field.state.value !== "" && field.state.meta.errors.length > 0 && <span className="field-error">{field.state.meta.errors.join(" ")}</span>}
					</label>
				)}
			</form.Field>
			<form.Field name="url">
				{(field) => (
					<label className="form-field">
						<span className="form-label">
							<span>server</span>
							<span className="hint">its MCP address: https, or http on your network</span>
						</span>
						<input value={field.state.value} placeholder="https://haos.example.com/api/mcp" autoCapitalize="off" spellCheck={false} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
					</label>
				)}
			</form.Field>
			<form.Field name="token">
				{(field) => (
					<label className="form-field">
						<span className="form-label">
							<span>token</span>
							<span className="hint">only if the service gave you one; otherwise sign in after adding it</span>
						</span>
						<input type="password" value={field.state.value} autoComplete="off" onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
					</label>
				)}
			</form.Field>
			<form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
				{([canSubmit, submitting]) => (
					<div className="form-bar">
						<button className="plain" type="button" onClick={done}>
							cancel
						</button>
						<button className="primary" type="submit" disabled={!canSubmit || submitting}>
							add connector
						</button>
					</div>
				)}
			</form.Subscribe>
		</form>
	);
}
