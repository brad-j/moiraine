// The app's frame: the sidebar for an agent, and beside it the column holding a conversation or a page. On a phone
// the sidebar is a drawer; wider, its column collapses to the rail. The agent shown last is remembered, so the pages
// across agents keep its sidebar, and so is whether the column is collapsed.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { type Agent, PROTOCOL } from "./api.ts";
import { useColorOf } from "./color.ts";
import { ago } from "./format.ts";
import { useSavedAt } from "./offline.ts";
import { queries, useAgent, useAgents } from "./queries.ts";
import { Drawer, Sidebar } from "./sidebar.tsx";
import { DRAWER, useSwipe } from "./swipe.ts";

const LAST = "moiraine.agent";
const COLLAPSED = "moiraine.collapsed";

/** The agent to show beside the pages across agents: the one shown last, while it's still there, or the default. */
export function useLastAgent(): Agent | undefined {
	const { byId, fallback } = useAgents();
	const [last] = useState(() => (typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(LAST)));
	return byId.get(last ?? "") ?? byId.get(fallback ?? "");
}

export function Frame({ agent, children }: { agent: Agent; children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const [collapsed, collapse] = useCollapsed();
	const app = useRef<HTMLDivElement>(null);
	useSwipe(app, open, setOpen);
	useEffect(() => sessionStorage.setItem(LAST, agent.id), [agent.id]);
	useBadge();
	// The agent's color, for what in the frame says it's this agent's: the rail's mark, its name in the log and headers.
	const color = useColorOf()(agent);
	return (
		<Drawer.Provider value={{ open, toggle: (to) => setOpen((now) => to ?? !now), collapsed, collapse }}>
			<div id="app" ref={app} className={[open && "drawer-open", collapsed && "collapsed"].filter(Boolean).join(" ") || undefined} data-agent-color={color}>
				<Sidebar agent={agent} />
				<button className="scrim" type="button" aria-label="Close the conversations" tabIndex={-1} onClick={() => setOpen(false)} />
				<div id="column">
					<VersionNotice />
					<SavedNotice />
					{children}
				</div>
			</div>
		</Drawer.Provider>
	);
}

/** Whether the sidebar's column is collapsed to the rail, kept on this device, and Ctrl+B (Cmd+B on a Mac) to switch it. */
function useCollapsed(): [boolean, () => void] {
	const [collapsed, setCollapsed] = useState(() => typeof localStorage !== "undefined" && localStorage.getItem(COLLAPSED) === "1");
	const collapse = useCallback(() => setCollapsed((now) => !now), []);
	useEffect(() => localStorage.setItem(COLLAPSED, collapsed ? "1" : "0"), [collapsed]);
	useEffect(() => {
		const press = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== "b" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || matchMedia(DRAWER).matches) return;
			event.preventDefault();
			collapse();
		};
		document.addEventListener("keydown", press);
		return () => document.removeEventListener("keydown", press);
	}, [collapse]);
	return [collapsed, collapse];
}

/** The frame for agent `id`, or says there's no such agent. */
export function AgentFrame({ id, children }: { id: string; children: ReactNode }) {
	const agent = useAgent(id);
	if (agent === undefined) {
		return (
			<div className="missing">
				<p className="page-problem">There's no agent {id}.</p>
			</div>
		);
	}
	return <Frame agent={agent}>{children}</Frame>;
}

/** Says so when gaidin speaks another protocol than this build was typed against: they're deployed separately. */
function VersionNotice() {
	const { data } = useQuery(queries.version);
	const client = useQueryClient();
	const [newBuild, setNewBuild] = useState(false);
	useEffect(() => {
		// An installed app stays open for days, resuming rather than reloading, so gaidin's version is asked again then.
		const ask = () => void client.invalidateQueries({ queryKey: queries.version.queryKey });
		const resume = () => document.visibilityState === "visible" && ask();
		// The service worker (public/sw.js) says when it has kept a changed shell: this page runs the previous build.
		const message = (event: MessageEvent) => (event.data as { type?: unknown } | null)?.type === "shell-changed" && setNewBuild(true);
		document.addEventListener("visibilitychange", resume);
		window.addEventListener("online", ask);
		navigator.serviceWorker?.addEventListener("message", message);
		// Messages queue until a page says it's listening, which adding a listener alone doesn't.
		navigator.serviceWorker?.startMessages?.();
		return () => {
			document.removeEventListener("visibilitychange", resume);
			window.removeEventListener("online", ask);
			navigator.serviceWorker?.removeEventListener("message", message);
		};
	}, [client]);
	return (
		<>
			{data !== undefined && data.protocol !== PROTOCOL && (
				<p className="version-notice">
					This app was built for gaidin's protocol {PROTOCOL}, and gaidin speaks {data.protocol}. Deploy a build of moiraine that matches it.
				</p>
			)}
			{newBuild && (
				<p className="version-notice" role="status">
					A new version is ready.{" "}
					<button type="button" onClick={() => location.reload()}>
						Reload
					</button>
				</p>
			)}
		</>
	);
}

/** Says so while gaidin can't be reached and what's shown is what the service worker kept. */
function SavedNotice() {
	const at = useSavedAt();
	if (at === undefined) return null;
	return (
		<p className="saved-notice" role="status">
			gaidin can't be reached, so this is what was here {ago(at)}. Check that this device is on the tailnet.
		</p>
	);
}

/** Keeps the app's icon badge on how many requests wait on the owner, where the device shows one. */
function useBadge() {
	const { data } = useQuery(queries.approvals);
	const waiting = data?.length;
	useEffect(() => {
		if (waiting === undefined || !("setAppBadge" in navigator)) return;
		// Refused without the notifications permission, which is the owner's to give.
		(waiting > 0 ? navigator.setAppBadge(waiting) : navigator.clearAppBadge()).catch(() => undefined);
	}, [waiting]);
}
