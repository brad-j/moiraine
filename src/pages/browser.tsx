// The browser: each profile gaidin's settings name, the page it was left on and by which agent, and taking one over.
// Taking over shows the profile's current tab live and sends it your clicks, scrolls and typing, so you can sign in,
// solve a CAPTCHA or confirm something; the agents' browser calls on it wait until you press Done or leave. Your input
// goes to the page, never through a model.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, KeyboardIcon } from "@phosphor-icons/react";
import { LIVE_PATH, type LiveEvent, type LiveInput, post, problem } from "../api.ts";
import { when } from "../format.ts";
import { queries, useAgents } from "../queries.ts";
import { Action, Empty, Page, SectionHead } from "./page.tsx";

/** Every profile, with where it was left. */
export function Profiles() {
	const { data: profiles } = useQuery({ ...queries.browser, refetchInterval: 10_000 });
	const { byId } = useAgents();
	return (
		<Page title="Browser">
			<section>
				<SectionHead title="Profiles" count={profiles?.length} />
				{profiles === undefined ? (
					<Empty>Loading…</Empty>
				) : profiles.length === 0 ? (
					<Empty>No browser profiles: gaidin's settings file names none.</Empty>
				) : (
					<ul className="rows">
						{profiles.map((profile) => (
							<li key={profile.name} className="profile-row">
								<Link to="/browser/$profile" params={{ profile: profile.name }} className="name">
									{profile.name}
								</Link>
								{profile.held && <span className="tag">taken over</span>}
								<p className="meta">
									{profile.url === undefined ? (
										"Not used yet."
									) : (
										<>
											<code>{profile.url}</code>
											{profile.agent !== undefined && <span> by {byId.get(profile.agent)?.name ?? profile.agent}</span>}
											{profile.at !== undefined && <span> · {when.format(profile.at)}</span>}
										</>
									)}
								</p>
							</li>
						))}
					</ul>
				)}
				<p className="page-note">Take a profile over to sign in to sites for the agents given it. Give agents profiles on their settings pages.</p>
			</section>
		</Page>
	);
}

/** Keys the view sends as keys rather than text; the rest of what's typed goes as text. */
const SPECIAL = new Set(["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
const BUTTONS = ["left", "middle", "right"] as const;
/** What the hidden box holds, so a phone's backspace has something to delete. */
const SENTINEL = " ";

/** Profile `name`, live, taken over while this is open. */
export function TakeOver({ name }: { name: string }) {
	const queryClient = useQueryClient();
	const { byId } = useAgents();
	const listed = useQuery(queries.browser).data?.find((p) => p.name === name);
	const canvas = useRef<HTMLCanvasElement>(null);
	const keys = useRef<HTMLTextAreaElement>(null);
	/** The page's size in CSS pixels, which input is given in. */
	const size = useRef({ width: 1280, height: 800 });
	const [session, setSession] = useState(0);
	const [state, setState] = useState<{ status: "connecting" | "live" } | { status: "released"; reason: string }>({ status: "connecting" });
	const [shown, setShown] = useState<{ url: string; title: string }>();
	const [address, setAddress] = useState("");
	const [failed, setFailed] = useState<string>();
	const queue = useRef<LiveInput[]>([]);
	const sending = useRef(false);
	/** A finger on the view: where it went down on the page, and on screen, so a drag scrolls and a tap clicks. */
	const touch = useRef<{ x: number; y: number; startY: number; lastY: number; moved: boolean }>(undefined);

	// The stream: frames drawn in order, the page's address and title, and the end of the hold.
	useEffect(() => {
		const source = new EventSource(`${LIVE_PATH}?profile=${encodeURIComponent(name)}`);
		let drawing = Promise.resolve();
		let frames = 0;
		source.onmessage = (message: MessageEvent<string>) => {
			// SAFETY: gaidin's live view sends only LiveEvents, as JSON.
			const event = JSON.parse(message.data) as LiveEvent;
			if (event.type === "frame") {
				drawing = drawing.then(async () => {
					const target = canvas.current;
					if (target === null) return;
					const bytes = Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0));
					const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/jpeg" }));
					if (target.width !== bitmap.width || target.height !== bitmap.height) Object.assign(target, { width: bitmap.width, height: bitmap.height });
					target.getContext("2d")?.drawImage(bitmap, 0, 0);
					bitmap.close();
					size.current = { width: event.width, height: event.height };
					target.dataset.frames = String(++frames);
				});
				setState((now) => (now.status === "connecting" ? { status: "live" } : now));
			} else if (event.type === "page") {
				setShown({ url: event.url, title: event.title });
				setAddress(event.url);
			} else {
				source.close();
				setState({ status: "released", reason: event.reason });
				void queryClient.invalidateQueries({ queryKey: ["browser"] });
				void queryClient.invalidateQueries({ queryKey: ["approvals"] });
			}
		};
		void queryClient.invalidateQueries({ queryKey: ["browser"] });
		return () => source.close();
	}, [name, session, queryClient]);

	/** Sends what's queued, in order, one request at a time. */
	async function flush() {
		if (sending.current) return;
		sending.current = true;
		while (queue.current.length > 0) {
			const events = queue.current.splice(0);
			try {
				await post("/api/browser/input", { profile: name, events });
			} catch (error) {
				setFailed(problem(error));
			}
		}
		sending.current = false;
	}

	function send(event: LiveInput) {
		// Of moves in a row, only the last matters.
		if (event.type === "move" && queue.current.at(-1)?.type === "move") queue.current.pop();
		queue.current.push(event);
		void flush();
	}

	/** Where a pointer is on the page, in its CSS pixels. */
	function at(event: { clientX: number; clientY: number }) {
		const rect = canvas.current!.getBoundingClientRect();
		return {
			x: Math.round(((event.clientX - rect.left) * size.current.width) / rect.width),
			y: Math.round(((event.clientY - rect.top) * size.current.height) / rect.height),
		};
	}

	// Scrolling the view scrolls the page, not this one; React's wheel handler can't prevent it.
	useEffect(() => {
		const target = canvas.current;
		if (target === null) return;
		const wheel = (event: WheelEvent) => {
			event.preventDefault();
			const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? size.current.height : 1;
			send({ type: "wheel", ...at(event), dx: event.deltaX * unit, dy: event.deltaY * unit });
		};
		target.addEventListener("wheel", wheel, { passive: false });
		return () => target.removeEventListener("wheel", wheel);
	});

	// Typing, from a hidden box: text as it's inserted, the keys that aren't text as keys, so a phone's keyboard works.
	useEffect(() => {
		const box = keys.current;
		if (box === null) return;
		box.value = SENTINEL;
		const reset = () => {
			box.value = SENTINEL;
			box.setSelectionRange(1, 1);
		};
		const before = (event: InputEvent) => {
			if (event.inputType === "insertCompositionText") return;
			event.preventDefault();
			if ((event.inputType === "insertText" || event.inputType === "insertReplacementText") && event.data) send({ type: "text", text: event.data });
			else if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") send({ type: "key", key: "Enter" });
			else if (event.inputType === "deleteContentBackward") send({ type: "key", key: "Backspace" });
			else if (event.inputType === "deleteContentForward") send({ type: "key", key: "Delete" });
			reset();
		};
		const composed = (event: CompositionEvent) => {
			if (event.data) send({ type: "text", text: event.data });
			reset();
		};
		box.addEventListener("beforeinput", before);
		box.addEventListener("compositionend", composed);
		return () => {
			box.removeEventListener("beforeinput", before);
			box.removeEventListener("compositionend", composed);
		};
	});

	function keyDown(event: React.KeyboardEvent) {
		if (event.nativeEvent.isComposing) return;
		const command = event.ctrlKey || event.metaKey || event.altKey;
		const paste = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
		if (!SPECIAL.has(event.key) && !(command && event.key.length === 1 && !paste)) return;
		event.preventDefault();
		const modifiers = [event.shiftKey && "Shift", event.ctrlKey && "Control", event.altKey && "Alt", event.metaKey && "Meta"].filter((m) => m !== false);
		send({ type: "key", key: [...modifiers, event.key].join("+") });
	}

	function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
		event.currentTarget.setPointerCapture(event.pointerId);
		const point = at(event);
		if (event.pointerType === "mouse") send({ type: "down", ...point, button: BUTTONS[event.button] ?? "left" });
		else touch.current = { ...point, startY: event.clientY, lastY: event.clientY, moved: false };
	}

	function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
		if (event.pointerType === "mouse") return send({ type: "move", ...at(event) });
		const started = touch.current;
		if (started === undefined) return;
		const rect = canvas.current!.getBoundingClientRect();
		const dy = ((started.lastY - event.clientY) * size.current.height) / rect.height;
		started.lastY = event.clientY;
		if (Math.abs(event.clientY - started.startY) > 8) started.moved = true;
		if (started.moved) send({ type: "wheel", x: started.x, y: started.y, dx: 0, dy });
	}

	function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
		if (event.pointerType === "mouse") return send({ type: "up", ...at(event), button: BUTTONS[event.button] ?? "left" });
		const started = touch.current;
		touch.current = undefined;
		if (started !== undefined && !started.moved) send({ type: "click", x: started.x, y: started.y });
	}

	async function go(event: FormEvent) {
		event.preventDefault();
		setFailed(undefined);
		const url = /^https?:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`;
		try {
			await post("/api/browser/go", { profile: name, url });
		} catch (error) {
			setFailed(problem(error));
		}
	}

	const last = listed?.agent === undefined ? undefined : (byId.get(listed.agent)?.name ?? listed.agent);
	const released = state.status === "released";
	return (
		<Page title={`Browser · ${name}`} wide>
			<section className="takeover">
				{failed !== undefined && <p className="page-problem">{failed}</p>}
				<form className="live-bar" onSubmit={go}>
					<Action label="Back" run={() => post("/api/browser/go", { profile: name, back: true })}>
						<ArrowLeftIcon aria-hidden="true" />
					</Action>
					<input aria-label="Address" value={address} onChange={(event) => setAddress(event.target.value)} disabled={released} spellCheck={false} autoCapitalize="off" />
					<button type="submit" disabled={released}>
						Go
					</button>
					<button type="button" className="keyboard" disabled={released} onClick={() => keys.current?.focus()}>
						<KeyboardIcon aria-hidden="true" />
						Keyboard
					</button>
					<Action className="primary" run={() => post("/api/browser/release", { profile: name })}>
						Done
					</Action>
				</form>
				{released ? (
					<div className="live-released">
						<p>Released: {state.reason}. The agents can use {name} again.</p>
						<button
							type="button"
							onClick={() => {
								setState({ status: "connecting" });
								setSession((n) => n + 1);
							}}
						>
							Take over again
						</button>
					</div>
				) : (
					<div className="live">
						<canvas
							ref={canvas}
							width={1280}
							height={800}
							aria-label={`${name}'s page${shown?.title ? `: ${shown.title}` : ""}`}
							onPointerDown={pointerDown}
							onPointerMove={pointerMove}
							onPointerUp={pointerUp}
							onContextMenu={(event) => event.preventDefault()}
							// A desktop's keyboard types into the page once it's clicked, through the hidden box; the canvas would
							// otherwise take the focus away from it. A phone's keyboard opens only from its button.
							onMouseDown={(event) => {
								event.preventDefault();
								keys.current?.focus({ preventScroll: true });
							}}
						/>
						{state.status === "connecting" && <p className="live-wait">Opening {name}…</p>}
						<textarea ref={keys} className="live-keys" aria-label="Type into the page" autoCapitalize="off" autoCorrect="off" spellCheck={false} onKeyDown={keyDown} onPaste={(event) => {
							event.preventDefault();
							const text = event.clipboardData.getData("text");
							if (text !== "") send({ type: "text", text });
						}} />
					</div>
				)}
				<p className="page-note">
					{released ? null : <>You have {name}: the agents' browser calls on it wait until you press Done or leave this page. </>}
					{last !== undefined && <>Last used by {last}. </>}
					What you type goes to the page, not to any agent.
				</p>
			</section>
		</Page>
	);
}

