// Agents: the roster. Each agent's job, its channel and who it may message, a way to its home conversation and
// settings, and making, archiving and restoring agents. Archiving pauses its jobs and cancels its reminders; its
// conversations, notes and sandbox stay, and restoring leaves its jobs paused. The default agent can't be archived.
import { PlusIcon } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { type Agent, post } from "../api.ts";
import { Avatar } from "../avatar.tsx";
import { ago, when } from "../format.ts";
import { useAgents } from "../queries.ts";
import { Action, Confirm, Page, SectionHead, useAttempt } from "./page.tsx";

/** Addresses the app's own pages take, and /app/, the app's old address, which an agent's id would be hidden behind. */
const TAKEN = new Set(["agents", "activity", "app", "browser"]);
const ID = /^[a-z][a-z0-9-]{0,30}$/;

export function Agents() {
	const { agents, byId, fallback } = useAgents();
	const [making, setMaking] = useState(false);
	const active = agents.filter((a) => a.archived === undefined);
	const archived = agents.filter((a) => a.archived !== undefined);
	return (
		<Page title="Agents">
			<section>
				<SectionHead title="Agents" count={active.length}>
					{!making && (
						<button className="plain" type="button" onClick={() => setMaking(true)}>
							<PlusIcon aria-hidden="true" />
							new agent
						</button>
					)}
				</SectionHead>
				<p className="page-note">
					Each agent has its own home conversation, sandbox, work notes, jobs and grants, and sees the shared notes about you. An agent with no Slack channel is reached from here and
					the command line.
				</p>
				{making && <MakeForm done={() => setMaking(false)} />}
				<ol className="rows">
					{active.map((agent) => (
						<AgentRow key={agent.id} agent={agent} isDefault={agent.id === fallback} names={(ids) => ids.map((id) => byId.get(id)?.name ?? id)} />
					))}
				</ol>
			</section>
			{archived.length > 0 && (
				<section>
					<SectionHead title="Archived" count={archived.length} />
					<ol className="rows">
						{archived.map((agent) => (
							<AgentRow key={agent.id} agent={agent} isDefault={false} names={(ids) => ids.map((id) => byId.get(id)?.name ?? id)} />
						))}
					</ol>
				</section>
			)}
		</Page>
	);
}

function AgentRow({ agent, isDefault, names }: { agent: Agent; isDefault: boolean; names: (ids: string[]) => string[] }) {
	const queryClient = useQueryClient();
	const archive = (archived: boolean) => post("/api/agents/archive", { id: agent.id, archived }).then(() => queryClient.invalidateQueries({ queryKey: ["agents"] }));
	return (
		<li className={`agent-row${agent.archived === undefined ? "" : " archived"}`}>
			<Avatar agent={agent} size="lg" />
			<div className="body">
				<div className="title">
					{agent.archived === undefined ? (
						<Link to="/$agent" params={{ agent: agent.id }}>
							{agent.name}
						</Link>
					) : (
						<span>{agent.name}</span>
					)}
					<code className="id">{agent.id}</code>
					{isDefault && <span className="tag">default</span>}
				</div>
				{agent.job !== "" && <p className="job">{agent.job}</p>}
				<div className="meta">
					<span>{agent.channel === undefined ? (isDefault ? "the settings file's Slack channel" : "no Slack channel") : `Slack ${agent.channel}`}</span>
					<span>{agent.canMessage.length === 0 ? "messages no one" : `messages ${names(agent.canMessage).join(", ")}`}</span>
					{agent.archived === undefined ? <span title={when.format(agent.createdAt)}>{agent.createdAt === 0 ? "the first agent" : `made ${ago(agent.createdAt)}`}</span> : <span>archived {ago(agent.archived)}</span>}
				</div>
			</div>
			<div className="actions">
				{agent.archived === undefined ? (
					<>
						<Link className="button-link" to="/$agent/settings" params={{ agent: agent.id }}>
							settings
						</Link>
						{!isDefault && <Confirm label="archive" run={() => archive(true)} />}
					</>
				) : (
					<Action run={() => archive(false)}>restore</Action>
				)}
			</div>
		</li>
	);
}

function MakeForm({ done }: { done: () => void }) {
	const attempt = useAttempt();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { agents } = useAgents();
	const form = useForm({
		defaultValues: { id: "", name: "", job: "" },
		onSubmit: async ({ value }) => {
			const made = await attempt(async () => {
				await post("/api/agents/save", { id: value.id.trim(), name: value.name.trim(), job: value.job.trim() });
				await queryClient.invalidateQueries({ queryKey: ["agents"] });
			});
			if (!made) return;
			done();
			void navigate({ to: "/$agent/settings", params: { agent: value.id.trim() } });
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
			<form.Field
				name="name"
				validators={{ onChange: ({ value }) => (value.trim() === "" ? "An agent needs a name." : agents.some((a) => a.name.toLowerCase() === value.trim().toLowerCase()) ? `Another agent is called ${value.trim()}.` : undefined) }}
			>
				{(field) => (
					<label className="form-field">
						<span className="form-label">
							<span>name</span>
							<span className="hint">what you call it</span>
						</span>
						<input
							value={field.state.value}
							placeholder="Scout"
							autoFocus
							onBlur={field.handleBlur}
							onChange={(event) => {
								const name = event.target.value;
								field.handleChange(name);
								// The id follows the name until it's typed itself.
								if (!form.getFieldMeta("id")?.isDirty) form.setFieldValue("id", name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^[^a-z]+|-+$/g, "").slice(0, 31), { dontUpdateMeta: true });
							}}
						/>
						{field.state.meta.isTouched && field.state.meta.errors.length > 0 && <span className="field-error">{field.state.meta.errors.join(" ")}</span>}
					</label>
				)}
			</form.Field>
			<form.Field
				name="id"
				validators={{
					onChange: ({ value }) =>
						!ID.test(value.trim())
							? "Lowercase letters, digits and -, starting with a letter."
							: TAKEN.has(value.trim())
								? `${value.trim()} is the address of one of the app's pages.`
								: agents.some((a) => a.id === value.trim())
									? `There's already an agent ${value.trim()}.`
									: undefined,
				}}
			>
				{(field) => (
					<label className="form-field">
						<span className="form-label">
							<span>id</span>
							<span className="hint">fixed once made; in its addresses and on the command line</span>
						</span>
						<input value={field.state.value} placeholder="scout" autoCapitalize="off" spellCheck={false} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
						{field.state.value !== "" && field.state.meta.errors.length > 0 && <span className="field-error">{field.state.meta.errors.join(" ")}</span>}
					</label>
				)}
			</form.Field>
			<form.Field name="job">
				{(field) => (
					<label className="form-field">
						<span className="form-label">
							<span>job</span>
							<span className="hint">one line, which you and the agents that may message it see</span>
						</span>
						<input value={field.state.value} placeholder="Looks things up and reports back." onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} />
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
							make agent
						</button>
					</div>
				)}
			</form.Subscribe>
		</form>
	);
}
