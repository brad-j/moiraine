// Skills: the guides every agent can open, and each one's files, shown as the agents read them. The address names
// what's open: /<agent>/skills, /<agent>/skills/<name>, /<agent>/skills/<name>/<file>, and #<heading> for a place in
// the file. Links between a skill's files stay on the page.
//
// The owner creates, edits and removes local skills here, which takes effect at once; an agent's own changes
// (write_skill, remove_skill) ask the owner first. The built-in skill is gaidin's documentation, and changes with its
// code.
import { PlusIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Agent, type Gets, post, problem } from "../api.ts";
import { useKeptDraft, useLeaveGuard } from "../guard.tsx";
import { Markdown } from "../markdown.tsx";
import { queries } from "../queries.ts";
import { Confirm, Empty, Page, SectionHead, useAttempt } from "./page.tsx";

type Skill = Gets["/api/skills"]["skills"][number];

/** A text area that grows with its text. */
function Editor(props: { value: string; label: string; onChange: (text: string) => void; className?: string; placeholder?: string; autoFocus?: boolean; onSave?: () => void }) {
	const box = useRef<HTMLTextAreaElement>(null);
	useLayoutEffect(() => {
		const el = box.current;
		if (el === null) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight + 2}px`;
	}, [props.value]);
	return (
		<textarea
			ref={box}
			className={props.className ?? "editor"}
			aria-label={props.label}
			value={props.value}
			placeholder={props.placeholder}
			spellCheck={props.className === "line"}
			autoFocus={props.autoFocus}
			onChange={(event) => props.onChange(event.target.value)}
			onKeyDown={(press) => {
				// Ctrl+S or ⌘S saves, as in an editor.
				if (props.onSave !== undefined && (press.ctrlKey || press.metaKey) && press.key === "s") {
					press.preventDefault();
					props.onSave();
				}
			}}
		/>
	);
}

export function Skills({ agent }: { agent: Agent }) {
	const listing = useQuery(queries.skills);
	const [creating, setCreating] = useState(false);
	return (
		<Page title="Skills" agent={agent}>
			{listing.data?.problems.map((p) => (
				<p key={p} className="page-problem">
					Not loaded: {p}
				</p>
			))}
			<section>
				<SectionHead title="Skills" count={listing.data?.skills.length}>
					{!creating && (
						<button className="plain" type="button" onClick={() => setCreating(true)}>
							<PlusIcon aria-hidden="true" />
							new skill
						</button>
					)}
				</SectionHead>
				<p className="page-note">
					Guides an agent opens when a request matches one's description. The built-in one is gaidin's own documentation. You write local skills here and they apply at once; an
					agent can write them too, after you allow each change.
				</p>
				{creating && <CreateForm agent={agent} cancel={() => setCreating(false)} />}
				{listing.isPending ? (
					<Empty>Loading…</Empty>
				) : (
					<ol className="rows">
						{(listing.data?.skills ?? []).map((skill) => (
							<li key={skill.name}>
								<Link className="skill-row" to="/$agent/skills/$name" params={{ agent: agent.id, name: skill.name }}>
									<span className="title">
										<span className="name">{skill.name}</span>
										<span className="tag">{skill.source}</span>
									</span>
									<span className="files">
										{skill.files.length} file{skill.files.length === 1 ? "" : "s"}
									</span>
									<p className="desc">{skill.description}</p>
								</Link>
							</li>
						))}
					</ol>
				)}
			</section>
		</Page>
	);
}

function CreateForm({ agent, cancel }: { agent: Agent; cancel: () => void }) {
	const attempt = useAttempt();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState({ name: "", description: "", body: "" });
	const [busy, setBusy] = useState(false);
	const guard = useLeaveGuard(draft.name !== "" || draft.description !== "" || draft.body !== "");
	const labelled = (text: string, hint: string, control: ReactNode) => (
		<label className="form-field">
			<span className="form-label">
				<span>{text}</span>
				<span className="hint">{hint}</span>
			</span>
			{control}
		</label>
	);
	return (
		<form
			className="skill-form"
			onSubmit={async (event) => {
				event.preventDefault();
				const name = draft.name.trim();
				const text = `---\nname: ${name}\ndescription: ${draft.description.trim().replace(/\s+/g, " ")}\n---\n\n${draft.body.trim()}\n`;
				setBusy(true);
				const made = await attempt(async () => {
					await post("/api/skills/save", { name, file: "SKILL.md", text });
					await queryClient.invalidateQueries({ queryKey: ["skills"] });
				});
				setBusy(false);
				if (made) {
					guard.release();
					void navigate({ to: "/$agent/skills/$name", params: { agent: agent.id, name } });
				}
			}}
		>
			{guard.dialog}
			{labelled(
				"name",
				"lowercase letters, digits and hyphens",
				<input value={draft.name} placeholder="homelab-alerts" autoCapitalize="off" spellCheck={false} autoFocus onChange={(event) => setDraft({ ...draft, name: event.target.value })} />,
			)}
			{labelled(
				"description",
				"one line: what it's for and when an agent should open it",
				<Editor className="line" label="Description" value={draft.description} placeholder="What to do when a homelab alert comes in. Open it for any alert from ntfy." onChange={(description) => setDraft({ ...draft, description })} />,
			)}
			{labelled(
				"guide",
				"Markdown; long reference material can go in other files later",
				<Editor label="Guide" value={draft.body} placeholder={"# Homelab alerts\n\nWhen a backup fails on think-2, check whether the NAS share is asleep before anything else."} onChange={(body) => setDraft({ ...draft, body })} />,
			)}
			<div className="form-bar">
				<button className="plain" type="button" onClick={cancel}>
					cancel
				</button>
				<button className="primary" type="submit" disabled={busy}>
					create skill
				</button>
			</div>
		</form>
	);
}

/** One skill, with `file` open: SKILL.md unless another is named. `create`: the file is being added, and has no text yet. */
export function SkillView({ agent, name, file = "SKILL.md", create = false }: { agent: Agent; name: string; file?: string; create?: boolean }) {
	const listing = useQuery(queries.skills);
	const skill = listing.data?.skills.find((s) => s.name === name);
	const isNew = create && skill !== undefined && !skill.files.includes(file);
	const text = useQuery({ ...queries.skillFile(name, file), enabled: skill !== undefined && !isNew });
	const location = useLocation();

	// A heading the address names, once the file's text is drawn.
	useEffect(() => {
		const id = location.hash;
		if (id === "" || text.data === undefined) return;
		document.getElementById(`h-${id}`)?.scrollIntoView({ block: "start" });
	}, [location.hash, text.data]);

	if (listing.isPending) {
		return (
			<Page title="Skills" agent={agent}>
				<Empty>Loading…</Empty>
			</Page>
		);
	}
	if (skill === undefined) {
		return (
			<Page title="Skills" agent={agent}>
				<p className="page-problem">No skill {name}.</p>
				<Link to="/$agent/skills" params={{ agent: agent.id }}>
					back to the skills
				</Link>
			</Page>
		);
	}
	const shown = isNew ? [...skill.files, file] : skill.files;
	return (
		<Page title={skill.name} agent={agent}>
			<SkillHeader agent={agent} skill={skill} />
			<div className="skill-body">
				<nav className="skill-files" aria-label="Files">
					{shown.map((f) => (
						<FileLink key={f} agent={agent} skill={skill.name} file={f} current={f === file}>
							{f}
						</FileLink>
					))}
					{skill.source === "local" && <NewFile agent={agent} skill={skill} />}
				</nav>
				<article className="skill-doc">
					{isNew ? (
						<FileEditor key={`${name}/${file}:new`} agent={agent} skill={skill} file={file} initial="" isNew done={() => {}} />
					) : text.isError ? (
						<p className="page-problem">{problem(text.error)}</p>
					) : text.data === undefined ? (
						<Empty>Loading…</Empty>
					) : (
						<Document key={`${name}/${file}`} agent={agent} skill={skill} file={file} text={text.data.text} />
					)}
				</article>
			</div>
		</Page>
	);
}

/** A link to one of a skill's files, at a heading in it if `anchor` is given. */
function FileLink({ agent, skill, file, anchor, current, children }: { agent: Agent; skill: string; file: string; anchor?: string; current?: boolean; children: ReactNode }) {
	const hash = anchor ?? "";
	if (file === "SKILL.md") {
		return (
			<Link to="/$agent/skills/$name" params={{ agent: agent.id, name: skill }} hash={hash} aria-current={current ? "page" : undefined} activeOptions={{ includeHash: false }}>
				{children}
			</Link>
		);
	}
	return (
		<Link to="/$agent/skills/$name/$" params={{ agent: agent.id, name: skill, _splat: file }} hash={hash} aria-current={current ? "page" : undefined}>
			{children}
		</Link>
	);
}

function SkillHeader({ agent, skill }: { agent: Agent; skill: Skill }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const local = skill.source === "local";
	return (
		<header className="skill-header">
			<nav className="crumbs" aria-label="Breadcrumb">
				<Link to="/$agent/skills" params={{ agent: agent.id }}>
					skills
				</Link>
				<span className="sep">/</span>
				<span>{skill.name}</span>
			</nav>
			<div className="skill-head">
				<h2>{skill.name}</h2>
				<span className="tag">{skill.source}</span>
				{local && (
					<div className="head-actions">
						<Confirm
							label="remove skill"
							run={async () => {
								await post("/api/skills/remove", { name: skill.name });
								await queryClient.invalidateQueries({ queryKey: ["skills"] });
								void navigate({ to: "/$agent/skills", params: { agent: agent.id } });
							}}
						/>
					</div>
				)}
			</div>
			<p className="skill-desc">{skill.description}</p>
			{!local && <p className="page-note">Built in: the documentation in gaidin's code. It changes when gaidin is updated.</p>}
		</header>
	);
}

/** "+ file", then a path for it, which opens an empty editor. */
function NewFile({ agent, skill }: { agent: Agent; skill: Skill }) {
	const navigate = useNavigate();
	const [path, setPath] = useState<string>();
	if (path === undefined) {
		return (
			<button className="plain add-file" type="button" onClick={() => setPath("")}>
				<PlusIcon aria-hidden="true" />
				file
			</button>
		);
	}
	return (
		<form
			className="new-file"
			onSubmit={(event) => {
				event.preventDefault();
				const file = path.trim().replace(/^\.?\//, "");
				if (file === "") return;
				setPath(undefined);
				// The address says it's being added, so the editor opens there and stays open through a reload.
				void navigate({ to: "/$agent/skills/$name/$", params: { agent: agent.id, name: skill.name, _splat: file }, search: skill.files.includes(file) ? {} : { create: true } });
			}}
		>
			<input
				aria-label="New file's path"
				value={path}
				placeholder="references/notes.md"
				autoCapitalize="off"
				spellCheck={false}
				autoFocus
				onChange={(event) => setPath(event.target.value)}
				onKeyDown={(press) => {
					if (press.key === "Escape") setPath(undefined);
				}}
			/>
		</form>
	);
}

/** A file as an agent reads it; a local skill's file can be edited and, past SKILL.md, removed. */
function Document({ agent, skill, file, text }: { agent: Agent; skill: Skill; file: string; text: string }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState(false);
	const local = skill.source === "local";
	if (editing) return <FileEditor agent={agent} skill={skill} file={file} initial={text} done={() => setEditing(false)} />;
	// SKILL.md's front matter is the name and description, shown above.
	const body = file === "SKILL.md" ? text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") : text;
	return (
		<>
			{local && (
				<div className="doc-bar">
					<span className="file">{file}</span>
					<button className="plain" type="button" onClick={() => setEditing(true)}>
						edit
					</button>
					{file !== "SKILL.md" && (
						<Confirm
							label="remove file"
							run={async () => {
								await post("/api/skills/remove", { name: skill.name, file });
								await queryClient.invalidateQueries({ queryKey: ["skills"] });
								void navigate({ to: "/$agent/skills/$name", params: { agent: agent.id, name: skill.name } });
							}}
						/>
					)}
				</div>
			)}
			{/\.md$/i.test(file) ? (
				<Markdown
					text={body}
					document
					link={(href, label, key) => {
						const target = resolve(skill, file, href);
						if (target === undefined) return undefined;
						return (
							<FileLink key={key} agent={agent} skill={skill.name} file={target.file} anchor={target.anchor}>
								{label}
							</FileLink>
						);
					}}
				/>
			) : (
				<pre>{text}</pre>
			)}
		</>
	);
}

function FileEditor({ agent, skill, file, initial, isNew = false, done }: { agent: Agent; skill: Skill; file: string; initial: string; isNew?: boolean; done: () => void }) {
	const attempt = useAttempt();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [kept, keep] = useKeptDraft(`skill:${agent.id}/${skill.name}/${file}`, initial);
	const draft = kept ?? initial;
	const [busy, setBusy] = useState(false);
	const guard = useLeaveGuard(draft !== initial, () => keep(undefined));
	const save = async () => {
		setBusy(true);
		const saved = await attempt(async () => {
			await post("/api/skills/save", { name: skill.name, file, text: draft });
			await queryClient.invalidateQueries({ queryKey: ["skills"] });
		});
		setBusy(false);
		if (!saved) return;
		guard.release();
		keep(undefined);
		done();
		// Made: the address stops saying it's being added.
		if (isNew) void navigate({ to: "/$agent/skills/$name/$", params: { agent: agent.id, name: skill.name, _splat: file }, search: {}, replace: true });
	};
	return (
		<div className="file-editor">
			{guard.dialog}
			<div className="doc-bar">
				<span className="file">{isNew ? `new: ${file}` : file}</span>
				<button
					className="plain"
					type="button"
					onClick={() => {
						guard.release();
						keep(undefined);
						done();
						if (isNew) void navigate({ to: "/$agent/skills/$name", params: { agent: agent.id, name: skill.name } });
					}}
				>
					cancel
				</button>
				<button className="primary" type="button" disabled={busy} onClick={() => void save()}>
					{isNew ? "create file" : "save"}
				</button>
			</div>
			<Editor label={`${skill.name}/${file}`} value={draft} onChange={keep} autoFocus onSave={() => void (busy ? undefined : save())} />
			{file === "SKILL.md" && <p className="page-note">Keep the front matter: name, the skill's name, and description, one line saying what it's for and when to open it.</p>}
		</div>
	);
}

/** Where a relative link in one of a skill's files goes: one of its files, or a heading in this one. */
function resolve(skill: Skill, from: string, href: string): { file: string; anchor?: string } | undefined {
	const [path = "", anchor] = href.split("#");
	if (path === "") return anchor === undefined ? undefined : { file: from, anchor };
	const target = decodeURIComponent(new URL(path, `file:///${from}`).pathname.slice(1));
	return skill.files.includes(target) ? { file: target, anchor } : undefined;
}
