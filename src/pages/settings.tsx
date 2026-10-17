// Settings: the agent's roster entry (name, job, Slack channel, picture and color), its model, thinking, tools and standing instructions,
// which apply from its next request and to new threads, what it may reach (hosts, workspaces, browser profiles, other
// agents), and the devices that get notifications. The settings file's values (keys, limits, Slack tokens) stay in the
// file.
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TrashIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { type Agent, type Posts, post, type Settings as AgentSettings, upload } from "../api.ts";
import { Avatar } from "../avatar.tsx";
import { COLORS, PALETTE, useColorOf } from "../color.ts";
import { when } from "../format.ts";
import { subscribeHere, supported, thisDevice, unsubscribe } from "../push.ts";
import { useKeptDraft, useLeaveGuard } from "../guard.tsx";
import { queries, useAgents } from "../queries.ts";
import { Action, Confirm, Empty, Page, SectionHead, useAttempt } from "./page.tsx";

const LEVELS = ["off", "low", "medium", "high"] as const;
type Change = Partial<Posts["/api/settings"]["body"]>;
type EntryChange = Omit<Posts["/api/agents/save"]["body"], "id">;

export function Settings({ agent }: { agent: Agent }) {
	const queryClient = useQueryClient();
	const settings = useQuery(queries.settings(agent.id));
	/** What the last change did, shown under the section it changed. */
	const [done, setDone] = useState<{ section: string; text: string }>();

	/** Saves `change` to the agent's settings, keeping the rest; the server takes the switched-off tools whole. */
	async function configure(section: string, text: string, change: Change) {
		const current = settings.data ?? (await queryClient.fetchQuery(queries.settings(agent.id)));
		const saved = await post("/api/settings", { agent: agent.id, disabledTools: current.tools.filter((t) => !t.enabled).map((t) => t.name), ...change });
		queryClient.setQueryData(queries.settings(agent.id).queryKey, saved);
		setDone({ section, text: `${text} Applies from the next request.` });
	}

	/** Saves a change to the agent's roster entry. */
	async function save(section: string, text: string, change: EntryChange) {
		await post("/api/agents/save", { id: agent.id, ...change });
		await queryClient.invalidateQueries({ queryKey: ["agents"] });
		setDone({ section, text });
	}

	const saved = (section: string) => (done?.section === section ? <p className="saved">{done.text}</p> : null);

	return (
		<Page title="Settings" agent={agent}>
			<EntrySection key={agent.id} agent={agent} save={(change) => save("agent", "Saved.", change)} saved={saved("agent")} />
			{settings.data === undefined ? (
				<Empty>Loading the settings…</Empty>
			) : (
				<>
					<ModelSection settings={settings.data} configure={configure} saved={saved("model")} />
					<ToolsSection settings={settings.data} configure={configure} saved={saved("tools")} />
					<InstructionsSection key={agent.id} agent={agent.id} settings={settings.data} configure={configure} saved={saved("instructions")} />
				</>
			)}
			<AccessSection agent={agent} save={save} saved={saved("access")} />
			<NotificationsSection />
		</Page>
	);
}

/** A labeled row of a section. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
	return (
		<div className="field">
			<div className="field-name">
				<span>{label}</span>
				{hint !== undefined && <span className="hint">{hint}</span>}
			</div>
			<div className="field-control">{children}</div>
		</div>
	);
}

/** A row of buttons, one pressed. */
export function Choices({ label, options, current, choose }: { label: string; options: readonly string[]; current: string; choose: (value: string) => Promise<unknown> }) {
	return (
		<div className="choices" role="group" aria-label={label}>
			{options.map((option) => (
				<ChoiceButton key={option} on={option === current} run={() => choose(option)}>
					{option}
				</ChoiceButton>
			))}
		</div>
	);
}

function ChoiceButton({ on, run, children }: { on: boolean; run: () => Promise<unknown>; children: ReactNode }) {
	const attempt = useAttempt();
	const [busy, setBusy] = useState(false);
	return (
		<button
			className={`choice${on ? " on" : ""}`}
			type="button"
			aria-pressed={on}
			disabled={busy}
			onClick={async () => {
				setBusy(true);
				await attempt(run);
				setBusy(false);
			}}
		>
			{children}
		</button>
	);
}

/** A switch for something on or off. */
export function Switch({ label, on, run }: { label: string; on: boolean; run: () => Promise<unknown> }) {
	const attempt = useAttempt();
	const [busy, setBusy] = useState(false);
	return (
		<button
			className={`switch${on ? " on" : ""}`}
			type="button"
			role="switch"
			aria-checked={on}
			disabled={busy}
			onClick={async () => {
				setBusy(true);
				await attempt(run);
				setBusy(false);
			}}
		>
			<span className="track" aria-hidden="true" />
			{label}
		</button>
	);
}

/** The agent's name, job and Slack channel, saved together. */
function EntrySection({ agent, save, saved }: { agent: Agent; save: (change: EntryChange) => Promise<void>; saved: ReactNode }) {
	const attempt = useAttempt();
	const { fallback } = useAgents();
	const form = useForm({
		defaultValues: { name: agent.name, job: agent.job, channel: agent.channel ?? "" },
		onSubmit: async ({ value, formApi }) => {
			if (await attempt(() => save({ name: value.name, job: value.job, channel: value.channel.trim() }))) formApi.reset(value);
		},
	});
	return (
		<section>
			<SectionHead title="Agent" count={agent.id} />
			<Picture agent={agent} save={save} />
			<form
				className="fields"
				onSubmit={(event) => {
					event.preventDefault();
					void form.handleSubmit();
				}}
			>
				<form.Field name="name" validators={{ onChange: ({ value }) => (value.trim() === "" ? "An agent needs a name." : undefined) }}>
					{(field) => (
						<Field label="name">
							<input aria-label="Name" value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
							{field.state.meta.errors.length > 0 && <p className="field-error">{field.state.meta.errors.join(" ")}</p>}
						</Field>
					)}
				</form.Field>
				<form.Field name="job">
					{(field) => (
						<Field label="job" hint="one line, which you and the agents that may message it see">
							<input aria-label="Job" value={field.state.value} placeholder="Looks after the homelab." onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
						</Field>
					)}
				</form.Field>
				<form.Field name="channel">
					{(field) => (
						<Field label="Slack channel" hint={agent.id === fallback ? "empty: the settings file's channel" : "empty: reached from the app and the command line only"}>
							<input
								aria-label="Slack channel"
								value={field.state.value}
								placeholder="C0123ABCD"
								autoCapitalize="off"
								spellCheck={false}
								onChange={(event) => field.handleChange(event.target.value)}
								onBlur={field.handleBlur}
							/>
						</Field>
					)}
				</form.Field>
				<form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting, state.isDirty] as const}>
					{([canSubmit, submitting, dirty]) => (
						<div className="form-bar">
							{dirty && (
								<button className="plain" type="button" onClick={() => form.reset()}>
									revert
								</button>
							)}
							<button className="primary" type="submit" disabled={!canSubmit || submitting || !dirty}>
								save
							</button>
						</div>
					)}
				</form.Subscribe>
			</form>
			{saved}
		</section>
	);
}

/** The agent's picture: a square from an image you choose, made 512 pixels, or none, which shows its initial. */
function Picture({ agent, save }: { agent: Agent; save: (change: EntryChange) => Promise<void> }) {
	const picker = useRef<HTMLInputElement>(null);
	const attempt = useAttempt();
	const [busy, setBusy] = useState(false);
	return (
		<div className="fields">
			<Field label="picture" hint="PNG, JPEG or WebP; shown cropped to a square">
				<div className="picture">
					<Avatar agent={agent} size="xl" />
					<input
						ref={picker}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						hidden
						aria-label="Picture file"
						onChange={async (event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (file === undefined) return;
							setBusy(true);
							await attempt(async () => {
								const square = await squared(file);
								const { id } = await upload(square, `${agent.id}.webp`);
								await save({ avatar: id });
							});
							setBusy(false);
						}}
					/>
					<button className="plain" type="button" disabled={busy} onClick={() => picker.current?.click()}>
						<UploadSimpleIcon aria-hidden="true" />
						{agent.avatar === undefined ? "choose a picture" : "change"}
					</button>
					{agent.avatar !== undefined && (
						<Action run={() => save({ avatar: "" })}>
							<TrashIcon aria-hidden="true" />
							remove
						</Action>
					)}
				</div>
			</Field>
			<Field label="color" hint={agent.color === undefined ? "by its place in the roster until you choose one" : "its mark in the rail and its name in the log"}>
				<Swatches agent={agent} save={save} />
			</Field>
		</div>
	);
}

/** The colors the agent can be shown in, the one it's shown in pressed, and a way back to its place's. */
function Swatches({ agent, save }: { agent: Agent; save: (change: EntryChange) => Promise<void> }) {
	const shown = useColorOf()(agent);
	const attempt = useAttempt();
	return (
		<div className="swatches" role="group" aria-label="Color">
			{PALETTE.map((color) => (
				<button
					key={color}
					className="swatch"
					type="button"
					data-agent-color={color}
					aria-pressed={color === shown}
					aria-label={COLORS[color]}
					title={COLORS[color]}
					onClick={() => void attempt(() => save({ color }))}
				/>
			))}
			{agent.color !== undefined && <Action run={() => save({ color: "" })}>by its place</Action>}
		</div>
	);
}

/** The middle square of an image, 512 pixels a side or its own size if smaller, as WebP. */
async function squared(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file).catch(() => {
		throw new Error("That file isn't an image this browser can read.");
	});
	const crop = Math.min(bitmap.width, bitmap.height);
	const side = Math.min(512, crop);
	const canvas = document.createElement("canvas");
	canvas.width = side;
	canvas.height = side;
	canvas.getContext("2d")?.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, side, side);
	bitmap.close();
	const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 0.9));
	if (blob === null) throw new Error("The picture couldn't be made.");
	return blob;
}

type Configure = (section: string, text: string, change: Change) => Promise<void>;

function ModelSection({ settings, configure, saved }: { settings: AgentSettings; configure: Configure; saved: ReactNode }) {
	return (
		<section>
			<SectionHead title="Model" />
			<div className="fields">
				<Field label="model" hint={settings.models.length > 1 ? undefined : "add more in the settings file's model.choices"}>
					<Choices label="Model" options={settings.models} current={settings.model} choose={(model) => configure("model", `Model set to ${model}.`, { model })} />
				</Field>
				<Field label="thinking" hint="more thinks longer and costs more">
					<Choices
						label="Thinking"
						options={LEVELS}
						current={settings.thinkingLevel}
						choose={(level) => {
							const thinkingLevel = LEVELS.find((l) => l === level) ?? "off";
							return configure("model", `Thinking set to ${thinkingLevel}.`, { thinkingLevel });
						}}
					/>
				</Field>
			</div>
			{saved}
		</section>
	);
}

function ToolsSection({ settings, configure, saved }: { settings: AgentSettings; configure: Configure; saved: ReactNode }) {
	const on = settings.tools.filter((t) => t.enabled).length;
	return (
		<section>
			<SectionHead title="Tools" count={`${on} of ${settings.tools.length} on`} />
			<p className="page-note">Tools you can switch off. Reminders, jobs, memory, questions and skills are always on.</p>
			<ul className="switches">
				{settings.tools.map((tool) => (
					<li key={tool.name}>
						<Switch
							label={tool.name}
							on={tool.enabled}
							run={() => {
								const off = new Set(settings.tools.filter((t) => !t.enabled).map((t) => t.name));
								if (tool.enabled) off.add(tool.name);
								else off.delete(tool.name);
								return configure("tools", `${tool.name} ${tool.enabled ? "off" : "on"}.`, { disabledTools: [...off] });
							}}
						/>
					</li>
				))}
			</ul>
			{saved}
		</section>
	);
}

function InstructionsSection({ agent, settings, configure, saved }: { agent: string; settings: AgentSettings; configure: Configure; saved: ReactNode }) {
	const attempt = useAttempt();
	const [draft, setDraft] = useKeptDraft(`instructions:${agent}`, settings.instructions);
	const [busy, setBusy] = useState(false);
	const box = useRef<HTMLTextAreaElement>(null);
	const text = draft ?? settings.instructions;
	const changed = draft !== undefined && draft !== settings.instructions;
	const guard = useLeaveGuard(changed);
	useLayoutEffect(() => {
		const el = box.current;
		if (el === null) return;
		el.style.height = "auto";
		el.style.height = `${Math.max(el.scrollHeight, 96)}px`;
	}, [text]);
	return (
		<section>
			<SectionHead title="Standing instructions" />
			{guard.dialog}
			<p className="page-note">Added to the system prompt of every conversation this agent has, its threads and job runs included.</p>
			<textarea
				ref={box}
				className="instructions-box"
				aria-label="Standing instructions"
				value={text}
				placeholder="Answer in British English. Keep answers under five sentences unless I ask for more."
				onChange={(event) => setDraft(event.target.value)}
			/>
			<div className="form-bar">
				{changed && (
					<button className="plain" type="button" onClick={() => setDraft(undefined)}>
						revert
					</button>
				)}
				<button
					className="primary"
					type="button"
					disabled={!changed || busy}
					onClick={async () => {
						setBusy(true);
						const value = draft ?? "";
						if (await attempt(() => configure("instructions", value.trim() === "" ? "Standing instructions cleared." : "Standing instructions saved.", { instructions: value }))) setDraft(undefined);
						setBusy(false);
					}}
				>
					save
				</button>
			</div>
			{saved}
		</section>
	);
}

/**
 * What the agent may reach: hosts it fetches from without asking, workspaces, browser profiles and the sites it acts on
 * there without asking, and the agents it may message.
 */
function AccessSection({ agent, save, saved }: { agent: Agent; save: (section: string, text: string, change: EntryChange) => Promise<void>; saved: ReactNode }) {
	const { agents } = useAgents();
	const names = useQuery(queries.workspaces).data?.names;
	// No list: every workspace, as for the default agent.
	const given = agent.workspaces ?? names ?? [];
	const profiles = useQuery(queries.profiles).data?.names;
	// No list: no profiles, the default agent's included.
	const browsers = agent.profiles ?? [];
	const acting = Object.entries(agent.actHosts ?? {}).flatMap(([profile, hosts]) => hosts.map((host) => ({ profile, host })));
	const connectors = useQuery(queries.connectors).data;
	const plugged = agent.connectors ?? [];
	const others = agents.filter((a) => a.id !== agent.id && (a.archived === undefined || agent.canMessage.includes(a.id)));
	const toggle = (list: readonly string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
	return (
		<section>
			<SectionHead title="Access" />
			<div className="fields">
				<Field label="hosts" hint="fetched without asking; added when you allow one for good">
					{agent.hosts.length === 0 ? (
						<p className="field-empty">None yet.</p>
					) : (
						<ul className="chips">
							{agent.hosts.map((host) => (
								<li key={host} className="chip">
									<code>{host}</code>
									<Action label={`Remove ${host}`} run={() => save("access", `${host} removed: ${agent.name} asks before fetching from it.`, { hosts: agent.hosts.filter((h) => h !== host) })}>
										remove
									</Action>
								</li>
							))}
						</ul>
					)}
				</Field>
				<Field label="workspaces" hint="machines it may work on, each still asking first">
					{names === undefined ? (
						<p className="field-empty">Loading…</p>
					) : names.length === 0 ? (
						<p className="field-empty">No workspaces are set up.</p>
					) : (
						<ul className="switches">
							{names.map((name) => (
								<li key={name}>
									<Switch label={name} on={given.includes(name)} run={() => save("access", `${name} ${given.includes(name) ? "taken away" : "given"}.`, { workspaces: toggle(given, name) })} />
								</li>
							))}
						</ul>
					)}
				</Field>
				<Field label="browser" hint="profiles it may use, with their sign-ins; a new host still asks">
					{profiles === undefined ? (
						<p className="field-empty">Loading…</p>
					) : profiles.length === 0 ? (
						<p className="field-empty">No browser profiles are set up.</p>
					) : (
						<ul className="switches">
							{profiles.map((name) => (
								<li key={name}>
									<Switch label={name} on={browsers.includes(name)} run={() => save("access", `${name} ${browsers.includes(name) ? "taken away" : "given"}.`, { profiles: toggle(browsers, name) })} />
								</li>
							))}
						</ul>
					)}
				</Field>
				{profiles !== undefined && profiles.length > 0 && (
					<Field label="acts on" hint="sites it clicks and types on without asking; added when you allow one">
						{acting.length === 0 ? (
							<p className="field-empty">None yet.</p>
						) : (
							<ul className="chips">
								{acting.map(({ profile, host }) => (
									<li key={`${profile}/${host}`} className="chip">
										<code>{host}</code> in {profile}
										<Action
											label={`Remove ${host} in ${profile}`}
											run={() => save("access", `${host} removed: ${agent.name} asks before acting on it in ${profile}.`, { actHosts: [{ profile, hosts: (agent.actHosts?.[profile] ?? []).filter((h) => h !== host) }] })}
										>
											remove
										</Action>
									</li>
								))}
							</ul>
						)}
					</Field>
				)}
				<Field label="connectors" hint="services whose tools it gets, as each tool is set">
					{connectors === undefined ? (
						<p className="field-empty">Loading…</p>
					) : connectors.length === 0 ? (
						<p className="field-empty">No connectors yet; add them on the Connectors page.</p>
					) : (
						<ul className="switches">
							{connectors.map(({ name }) => (
								<li key={name}>
									<Switch label={name} on={plugged.includes(name)} run={() => save("access", `${name} ${plugged.includes(name) ? "taken away" : "given"}.`, { connectors: toggle(plugged, name) })} />
								</li>
							))}
						</ul>
					)}
				</Field>
				<Field label="may message" hint="agents it may ask and hand work to">
					{others.length === 0 ? (
						<p className="field-empty">No other agents.</p>
					) : (
						<ul className="switches">
							{others.map((other) => (
								<li key={other.id}>
									<Switch
										label={other.name}
										on={agent.canMessage.includes(other.id)}
										run={() => save("access", `${agent.name} ${agent.canMessage.includes(other.id) ? "may no longer" : "may now"} message ${other.name}.`, { canMessage: toggle(agent.canMessage, other.id) })}
									/>
								</li>
							))}
						</ul>
					)}
				</Field>
			</div>
			{saved}
		</section>
	);
}

/** The devices that get notifications, which are every agent's. */
function NotificationsSection() {
	const queryClient = useQueryClient();
	const push = useQuery(queries.push);
	const [mine, setMine] = useState<string>();
	const [done, setDone] = useState<string>();
	useEffect(() => {
		void thisDevice().then(setMine);
	}, []);
	const refresh = async () => {
		await queryClient.invalidateQueries({ queryKey: ["push"] });
		setMine(await thisDevice());
	};
	if (push.data === undefined) {
		return (
			<section>
				<SectionHead title="Notifications" />
				<Empty>{push.isError ? "Couldn't load the devices." : "Loading…"}</Empty>
			</section>
		);
	}
	if (push.data === null) {
		return (
			<section>
				<SectionHead title="Notifications" />
				<Empty>Notifications need web.url in gaidin's settings file.</Empty>
			</section>
		);
	}
	const info = push.data;
	const note = supported()
		? "Reminders, job reports, and approvals and questions waiting on you, from every agent, on each device that's turned on."
		: /iPhone|iPad/.test(navigator.userAgent)
			? "On an iPhone or iPad, add the app to the Home Screen (Share, then Add to Home Screen) and open it from there to turn notifications on."
			: "This browser can't get notifications.";
	return (
		<section>
			<SectionHead title="Notifications" count={info.devices.length}>
				{supported() && !info.devices.some((d) => d.endpoint === mine) && (
					<Action
						className="primary"
						run={async () => {
							await subscribeHere(info.publicKey);
							await refresh();
							setDone("Notifications are on for this device.");
						}}
					>
						turn on here
					</Action>
				)}
				{info.devices.length > 0 && (
					<Action
						run={async () => {
							const { sent } = await post("/api/push/test", {});
							setDone(`Sent to ${sent} device${sent === 1 ? "" : "s"}.`);
						}}
					>
						send a test
					</Action>
				)}
			</SectionHead>
			<p className="page-note">{note}</p>
			{info.devices.length === 0 ? (
				<Empty>No device gets notifications yet.</Empty>
			) : (
				<ul className="rows">
					{info.devices.map((device) => (
						<li key={device.endpoint} className="device-row">
							<span className="device">
								{device.label}
								{device.endpoint === mine && <span className="tag">this device</span>}
							</span>
							<span className="since">since {when.format(device.addedAt)}</span>
							<Confirm
								label="remove"
								run={async () => {
									await unsubscribe(device.endpoint);
									await refresh();
								}}
							/>
						</li>
					))}
				</ul>
			)}
			{done !== undefined && <p className="saved">{done}</p>}
		</section>
	);
}
