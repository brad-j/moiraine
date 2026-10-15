// Memory: the shared notes about the owner and their world, which every agent sees, and the agent's own work notes.
// The owner adds, edits and forgets them here without asking; an agent's own writes ask after outside text.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import { type Agent, type Gets, post } from "../api.ts";
import { ago, when } from "../format.ts";
import { queries, useAgents } from "../queries.ts";
import { Confirm, Empty, Page, SectionHead, useAttempt } from "./page.tsx";

type Note = Gets["/api/memory"]["notes"][number];

export function Memory({ agent }: { agent: Agent }) {
	const listing = useQuery(queries.memory(agent.id));
	return (
		<Page title="Memory" agent={agent}>
			{listing.isPending && <Empty>Loading…</Empty>}
			{listing.data !== undefined && (
				<>
					<Shelf
						agent={agent}
						work={false}
						title="Shared notes"
						about="About you and your world. Every agent sees them at the end of its system prompt, as things it was told, not instructions."
						notes={listing.data.notes}
						max={listing.data.maxTotal}
						maxNote={listing.data.maxNote}
						placeholder="Add a note: the NAS is in the hall closet"
					/>
					<Shelf
						agent={agent}
						work
						title={`${agent.name}'s work notes`}
						about={`What ${agent.name} keeps for its own work. Only ${agent.name} sees them.`}
						notes={listing.data.work}
						max={listing.data.maxWork}
						maxNote={listing.data.maxNote}
						placeholder="Add a work note: backups run at 03:00 on think-2"
					/>
				</>
			)}
		</Page>
	);
}

type ShelfProps = { agent: Agent; work: boolean; title: string; about: string; notes: readonly Note[]; max: number; maxNote: number; placeholder: string };

function Shelf({ agent, work, title, about, notes, max, maxNote, placeholder }: ShelfProps) {
	const queryClient = useQueryClient();
	const attempt = useAttempt();
	const [adding, setAdding] = useState("");
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<number>();
	const used = notes.reduce((sum, n) => sum + n.text.length, 0);
	const reload = () => queryClient.invalidateQueries({ queryKey: ["memory", agent.id] });
	const label = work ? "A new work note" : "A new note";

	async function add() {
		if (adding.trim() === "") return;
		setBusy(true);
		if (await attempt(() => post("/api/memory/add", { text: adding, agent: agent.id, work }).then(reload))) setAdding("");
		setBusy(false);
	}

	return (
		<section>
			<SectionHead title={title} count={notes.length}>
				<span className={`usage${used > max * 0.9 ? " near" : ""}`}>
					{used.toLocaleString()} of {max.toLocaleString()} characters
				</span>
			</SectionHead>
			<p className="page-note">{about}</p>
			<form
				className="note-add"
				onSubmit={(event) => {
					event.preventDefault();
					void add();
				}}
			>
				<NoteBox value={adding} max={maxNote} label={label} placeholder={placeholder} onChange={setAdding} onEnter={() => void add()} />
				<div className="note-bar">
					<Chars text={adding} max={maxNote} />
					<button className="primary" type="submit" disabled={busy || adding.trim() === ""}>
						add
					</button>
				</div>
			</form>
			{notes.length === 0 ? (
				<Empty>{work ? `No work notes yet. ${agent.name} writes them as it learns its job.` : "No notes yet. Add one above, or tell an agent something worth keeping."}</Empty>
			) : (
				<ol className="rows">
					{/* Newest first: the one just added or changed is at the top. */}
					{[...notes]
						.sort((a, b) => b.updatedAt - a.updatedAt)
						.map((note) =>
							editing === note.id ? (
								<NoteEditor key={note.id} note={note} max={maxNote} save={(text) => post("/api/memory/update", { id: note.id, text, agent: agent.id, work }).then(reload)} done={() => setEditing(undefined)} />
							) : (
								<NoteRow key={note.id} note={note} edit={() => setEditing(note.id)} forget={() => post("/api/memory/forget", { id: note.id, agent: agent.id, work }).then(reload)} />
							),
						)}
				</ol>
			)}
		</section>
	);
}

/** A note's length as the server counts it, against `max`. */
function Chars({ text, max }: { text: string; max: number }) {
	const length = text.trim().replace(/\s+/g, " ").length;
	return <span className={`chars${length > max ? " over" : ""}`}>{length === 0 ? "" : `${length}/${max}`}</span>;
}

/** A text box that grows with its text. Enter is `onEnter`; Shift+Enter starts a new line; Esc is `onEscape`. */
function NoteBox(props: { value: string; max: number; label: string; placeholder?: string; onChange: (text: string) => void; onEnter: () => void; onEscape?: () => void; autoFocus?: boolean }) {
	const box = useRef<HTMLTextAreaElement>(null);
	useLayoutEffect(() => {
		const el = box.current;
		if (el === null) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [props.value]);
	return (
		<textarea
			ref={box}
			className="note-box"
			rows={1}
			value={props.value}
			aria-label={props.label}
			placeholder={props.placeholder}
			autoFocus={props.autoFocus}
			onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
			onChange={(event) => props.onChange(event.target.value)}
			onKeyDown={(press) => {
				if (press.nativeEvent.isComposing) return;
				if (press.key === "Enter" && !press.shiftKey) {
					press.preventDefault();
					props.onEnter();
				} else if (press.key === "Escape" && props.onEscape !== undefined) {
					press.preventDefault();
					press.stopPropagation();
					props.onEscape();
				}
			}}
		/>
	);
}

function Meta({ note }: { note: Note }) {
	const { byId } = useAgents();
	const by = note.by === "owner" ? "you" : (byId.get(note.by)?.name ?? note.by);
	return (
		<div className="meta">
			<span className={`by ${note.by === "owner" ? "owner" : "agent"}`}>{by}</span>
			<span title={when.format(note.updatedAt)}>
				{note.updatedAt === note.createdAt ? "added" : "changed"} {ago(note.updatedAt)}
			</span>
			<span className="id">#{note.id}</span>
		</div>
	);
}

function NoteRow({ note, edit, forget }: { note: Note; edit: () => void; forget: () => Promise<unknown> }) {
	return (
		<li className="note-row">
			<p className="text">{note.text}</p>
			<div className="actions">
				<button className="plain" type="button" onClick={edit}>
					edit
				</button>
				<Confirm label="forget" run={forget} />
			</div>
			<Meta note={note} />
		</li>
	);
}

function NoteEditor({ note, max, save, done }: { note: Note; max: number; save: (text: string) => Promise<unknown>; done: () => void }) {
	const attempt = useAttempt();
	const [draft, setDraft] = useState(note.text);
	const [busy, setBusy] = useState(false);
	const submit = async () => {
		setBusy(true);
		if (await attempt(() => save(draft))) done();
		else setBusy(false);
	};
	return (
		<li className="note-row editing">
			<NoteBox value={draft} max={max} label={`Note ${note.id}`} onChange={setDraft} onEnter={() => void submit()} onEscape={done} autoFocus />
			<div className="note-bar">
				<Chars text={draft} max={max} />
				<button className="plain" type="button" onClick={done}>
					cancel
				</button>
				<button className="primary" type="button" disabled={busy} onClick={() => void submit()}>
					save
				</button>
			</div>
			<Meta note={note} />
		</li>
	);
}
