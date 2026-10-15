// The prompt, as in gaidin's console: a text box that grows, with the status line under it. Enter sends, a leading /
// runs a command (Tab completes, and a menu offers them), ↑ and ↓ go through earlier messages, and Esc or Ctrl+C
// stops a run.
import { type ReactNode, useEffect, useImperativeHandle, useRef, useState } from "react";

export type Choice = { value: string; hint?: string };
export type Command = { name: string; args?: string; help: string; run: (arg: string) => void | Promise<void>; complete?: () => Choice[] };
type Suggestion = { value: string; label: string; args?: string; hint?: string; run: boolean };

/** What the conversation does with the prompt: put text in it, from a status line button. */
export type PromptHandle = { prefill: (text: string) => void };

function suggestions(commands: readonly Command[], text: string): Suggestion[] {
	if (!text.startsWith("/") || text.startsWith("//") || text.includes("\n")) return [];
	const body = text.slice(1);
	const space = body.indexOf(" ");
	if (space < 0) {
		return commands
			.filter((c) => c.name.startsWith(body))
			.map((c) => ({ value: c.args ? `/${c.name} ` : `/${c.name}`, label: `/${c.name}`, args: c.args, hint: c.help, run: c.args === undefined }));
	}
	const name = body.slice(0, space);
	const arg = body.slice(space + 1);
	const command = commands.find((c) => c.name === name);
	if (command?.complete === undefined) return [];
	return command
		.complete()
		.filter((o) => o.value.startsWith(arg) && o.value !== arg)
		.map((o) => ({ value: `/${name} ${o.value}`, label: o.value, hint: o.hint, run: true }));
}

export function Prompt({ ref, ...props }: {
	ref?: React.Ref<PromptHandle>;
	placeholder: string;
	commands: readonly Command[];
	/** Earlier messages in the conversation, oldest first, for ↑. */
	history: () => string[];
	/** Sends a message; throws to put it back in the box. */
	send: (content: string) => Promise<void>;
	/** Echoes and runs a command line. */
	command: (line: string) => Promise<void>;
	running: boolean;
	stop: (echo?: string) => void;
	/** Below the text box: the status line. */
	children: ReactNode;
}) {
	const { commands, running, stop } = props;
	const input = useRef<HTMLTextAreaElement>(null);
	const [text, setText] = useState("");
	const [menuIndex, setMenuIndex] = useState(0);
	const [dismissed, setDismissed] = useState<string>();
	/** Commands typed since the page opened, after the conversation's messages for ↑. */
	const typed = useRef<string[]>([]);
	const recalling = useRef<{ list: string[]; at: number; draft: string } | undefined>(undefined);

	const items = text === dismissed ? [] : suggestions(commands, text);
	const index = Math.min(menuIndex, Math.max(0, items.length - 1));

	const fit = () => {
		const box = input.current;
		if (box === null) return;
		box.style.height = "auto";
		box.style.height = `${box.scrollHeight}px`;
	};
	useEffect(fit, [text]);

	const prefill = (value: string) => {
		setText(value);
		setDismissed(undefined);
		recalling.current = undefined;
		setMenuIndex(0);
		requestAnimationFrame(() => {
			input.current?.focus();
			input.current?.setSelectionRange(value.length, value.length);
		});
	};
	useImperativeHandle(ref, () => ({ prefill }));

	async function submit(value = text) {
		const content = value.trim();
		if (content === "") return;
		recalling.current = undefined;
		setDismissed(undefined);
		setText("");
		setMenuIndex(0);
		if (content.startsWith("/") && !content.startsWith("//")) {
			typed.current.push(content);
			return props.command(content);
		}
		try {
			await props.send(content.startsWith("//") ? content.slice(1) : content);
		} catch {
			// Put the message back so it isn't lost; the conversation says what went wrong.
			setText((now) => (now === "" ? value : now));
		}
	}

	function accept(item: Suggestion, submitIfReady: boolean) {
		setMenuIndex(0);
		input.current?.focus();
		if (submitIfReady && item.run) return void submit(item.value);
		setText(item.value);
	}

	function recall(step: number) {
		const list = recalling.current?.list ?? [...props.history(), ...typed.current].filter((t, i, all) => t !== all[i - 1]);
		const draft = recalling.current?.draft ?? text;
		const at = Math.max(0, Math.min(list.length, (recalling.current?.at ?? list.length) + step));
		const value = at === list.length ? draft : list[at]!;
		recalling.current = at === list.length ? undefined : { list, at, draft };
		setText(value);
		setDismissed(value);
		requestAnimationFrame(() => input.current?.setSelectionRange(value.length, value.length));
	}

	function keydown(press: React.KeyboardEvent<HTMLTextAreaElement>) {
		const { key, shiftKey } = press;
		if (press.nativeEvent.isComposing) return;
		if (items.length > 0) {
			const handled = () => {
				press.preventDefault();
				press.stopPropagation();
			};
			if (key === "ArrowDown" || key === "ArrowUp") {
				handled();
				return setMenuIndex((index + (key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
			}
			if (key === "Tab") {
				handled();
				return accept(items[index]!, false);
			}
			if (key === "Escape") {
				handled();
				return setDismissed(text);
			}
			// Enter takes the highlighted suggestion, unless a whole command is already typed.
			if (key === "Enter" && !shiftKey && !commands.some((c) => text === `/${c.name}`)) {
				handled();
				return accept(items[index]!, true);
			}
		}
		if (key === "Enter" && !shiftKey) {
			press.preventDefault();
			return void submit();
		}
		const box = press.currentTarget;
		const caret = box.selectionStart;
		if (key === "ArrowUp" && box.selectionEnd === caret && !text.slice(0, caret).includes("\n")) {
			press.preventDefault();
			recall(-1);
		} else if (key === "ArrowDown" && recalling.current !== undefined && box.selectionEnd === caret && !text.slice(caret).includes("\n")) {
			press.preventDefault();
			recall(1);
		}
	}

	// Esc and Ctrl+C stop a run, from the prompt or with nothing else to type in; typing anywhere else goes to the prompt.
	useEffect(() => {
		const press = (event: KeyboardEvent) => {
			const { key, altKey, ctrlKey, metaKey } = event;
			const target = event.target;
			const typing = target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
			const stoppable = !typing || target === input.current;
			if (event.defaultPrevented) return;
			if (key === "Escape" && running && stoppable) {
				event.preventDefault();
				return stop();
			}
			// Ctrl+C stops a run, as in a terminal, unless there's a selection to copy.
			if (ctrlKey && !metaKey && !altKey && (key === "c" || key === "C") && stoppable) {
				const box = input.current;
				const selected = (window.getSelection()?.toString() ?? "") !== "" || (box !== null && box.selectionStart !== box.selectionEnd);
				if (selected) return;
				event.preventDefault();
				if (running) stop("^C");
				else if (box?.value !== "") prefill("");
				return;
			}
			if (!typing && !ctrlKey && !metaKey && !altKey && key.length === 1) input.current?.focus();
		};
		document.addEventListener("keydown", press);
		return () => document.removeEventListener("keydown", press);
	});

	return (
		<>
			{items.length > 0 && (
				<div id="menu" role="listbox" aria-label="Commands">
					{items.map((item, n) => (
						<div
							key={item.value}
							id={`menu-${n}`}
							role="option"
							aria-selected={n === index}
							className={`item${n === index ? " active" : ""}`}
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => accept(item, true)}
						>
							<span className="v">
								{item.label}
								{item.args && <span className="a"> {item.args}</span>}
							</span>
							<span className="h">{item.hint ?? ""}</span>
						</div>
					))}
				</div>
			)}
			<form
				id="prompt"
				onSubmit={(event) => {
					event.preventDefault();
					void submit();
				}}
			>
				<textarea
					id="message"
					ref={input}
					rows={1}
					value={text}
					placeholder={props.placeholder}
					aria-label={props.placeholder}
					aria-controls="menu"
					aria-activedescendant={items.length > 0 ? `menu-${index}` : undefined}
					autoComplete="off"
					spellCheck
					autoFocus
					onChange={(event) => {
						recalling.current = undefined;
						setDismissed(undefined);
						setText(event.target.value);
					}}
					onKeyDown={keydown}
				/>
				<div id="bar">
					<div id="statusline">{props.children}</div>
					<button id="send" className="primary" type="submit">
						Send <kbd>↵</kbd>
					</button>
				</div>
			</form>
		</>
	);
}
