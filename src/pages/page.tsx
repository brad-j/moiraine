// What the pages beside the conversations are built from: the frame (a header naming the page, one centered column,
// and the dock), section heads, buttons that run an action and show what went wrong, and a cancel or delete that
// takes a second press.
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { type Agent, problem } from "../api.ts";
import { Avatar } from "../avatar.tsx";
import { Dock } from "../conversation/dock.tsx";
import { queries } from "../queries.ts";
import { MenuButton } from "../sidebar.tsx";

/** Runs a page's action, showing what went wrong at the top of the page; resolves to whether it worked. */
type Attempt = (run: () => Promise<unknown>) => Promise<boolean>;
const Attempts = createContext<Attempt>(async (run) => {
	await run();
	return true;
});

/** `wide`: the column takes the window's width, for the browser's live view. */
export function Page({ title, agent, wide = false, children }: { title: string; agent?: Agent; wide?: boolean; children: ReactNode }) {
	const [failed, setFailed] = useState<string>();
	const attempt: Attempt = async (run) => {
		setFailed(undefined);
		try {
			await run();
			return true;
		} catch (error) {
			setFailed(problem(error));
			return false;
		}
	};
	// No conversation is open here to say when the requests waiting on the owner change, so the dock asks again often.
	useQuery({ ...queries.approvals, refetchInterval: 5_000 });
	useEffect(() => {
		document.title = agent === undefined ? title : `${title} · ${agent.name}`;
	}, [title, agent]);
	return (
		<Attempts.Provider value={attempt}>
			<header className="convo-head">
				<MenuButton />
				<h1>{title}</h1>
				{agent !== undefined && (
					<span className="tag with-avatar">
						<Avatar agent={agent} size="sm" />
						{agent.name}
					</span>
				)}
			</header>
			<main className="page-scroll">
				<div className={wide ? "page wide" : "page"}>
					{failed !== undefined && <p className="page-problem">{failed}</p>}
					{children}
				</div>
			</main>
			<footer id="dock" className="on-page">
				<div id="dock-inner">
					<Dock typed={false} />
				</div>
			</footer>
		</Attempts.Provider>
	);
}

export function useAttempt(): Attempt {
	return useContext(Attempts);
}

/** A section's heading: its title, a count or note beside it, and its actions on the right. */
export function SectionHead({ title, count, children }: { title: string; count?: ReactNode; children?: ReactNode }) {
	return (
		<div className="section-head">
			<h2>{title}</h2>
			{count !== undefined && <span className="count">{count}</span>}
			{children !== undefined && <div className="head-actions">{children}</div>}
		</div>
	);
}

/** The time now, again each minute, so a page's "in 25 min" stays true. */
export function useMinute(): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

export function Empty({ children }: { children: ReactNode }) {
	return <p className="page-empty">{children}</p>;
}

/** A button that runs `run` as the page's action, disabled while it does. */
export function Action({ run, className = "plain", children, label }: { run: () => Promise<unknown>; className?: string; children: ReactNode; label?: string }) {
	const attempt = useAttempt();
	const [busy, setBusy] = useState(false);
	return (
		<button
			className={className}
			type="button"
			aria-label={label}
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

/**
 * A button for something that can't be undone, such as a cancel or a forget: the first press turns it into
 * "confirm", and a second press within 4 seconds runs it.
 */
export function Confirm({ label, run }: { label: string; run: () => Promise<unknown> }) {
	const attempt = useAttempt();
	const [armed, setArmed] = useState(false);
	const [busy, setBusy] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	// The same button both times, so the second press lands where the first did and keeps its focus.
	return (
		<button
			className={armed ? "danger" : "plain"}
			type="button"
			disabled={busy}
			aria-label={armed ? `Press again to ${label} for good` : undefined}
			onClick={async () => {
				clearTimeout(timer.current);
				if (!armed) {
					setArmed(true);
					timer.current = setTimeout(() => setArmed(false), 4000);
					return;
				}
				setArmed(false);
				setBusy(true);
				await attempt(run);
				setBusy(false);
			}}
		>
			{armed ? `confirm ${label}` : label}
		</button>
	);
}
