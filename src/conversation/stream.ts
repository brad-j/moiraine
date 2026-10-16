// A conversation, live: its event stream from gaidin's /events, kept by the transcript reducer, drawn at most once a
// frame. The events also refresh the queries they affect.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { StreamEvent } from "../api.ts";
import { savedTranscript, saveTranscript } from "../offline.ts";
import { applyEvent, newTranscript, type Transcript } from "../transcript.ts";

/** How long to wait before opening a stream that was closed, at first and at most. */
const RETRY_MS = 1_000;
const MAX_RETRY_MS = 15_000;
/** How long in the background before a stream that says it's open is opened again anyway. */
const STALE_MS = 20_000;
/** How long the stream is quiet before the transcript is kept for when gaidin can't be reached. */
const SAVE_MS = 2_000;

/** Which conversation: an agent's home, or `conversation` by id. */
export type Target = { agent: string; conversation?: number };

/**
 * `onEvent` hears each event after the transcript has it. `ready` once there's a transcript to show: gaidin's, or the
 * one kept from last time, which shows at once while gaidin's is on its way.
 */
export function useConversation(target: Target, onEvent?: (event: StreamEvent, transcript: Transcript) => void): { transcript: Transcript; connected: boolean; ready: boolean } {
	const queryClient = useQueryClient();
	const [state, setState] = useState(() => ({ transcript: newTranscript(), connected: false, ready: false }));
	const { agent, conversation } = target;
	// The transcript is changed in place, many times a frame while text streams in; a new state object draws it.
	const live = useRef(state);
	const heard = useRef(onEvent);
	useEffect(() => {
		heard.current = onEvent;
	});

	useEffect(() => {
		live.current = { transcript: newTranscript(), connected: false, ready: false };
		setState(live.current);
		const invalidate = (...keys: unknown[][]) => {
			for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
		};
		let frame = 0;
		const draw = () => {
			if (frame !== 0) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				setState({ ...live.current });
			});
		};
		const address = `/events?${conversation === undefined ? `agent=${encodeURIComponent(agent)}` : `conversation=${conversation}`}`;
		// Kept once gaidin has sent the transcript, and shown until gaidin sends it again, or while the stream can't connect.
		const key = address.slice("/events?".length);
		const transcript = live.current.transcript;
		let current = false;
		let restoring = false;
		let saving: ReturnType<typeof setTimeout> | undefined;
		const keep = () => {
			saving = undefined;
			void saveTranscript(key, transcript).catch(() => undefined);
		};
		const save = (after = SAVE_MS) => {
			clearTimeout(saving);
			if (current) saving = setTimeout(keep, after);
		};
		const restore = async () => {
			restoring = true;
			const saved = await savedTranscript(key).catch(() => undefined);
			if (saved === undefined || current || closed) return;
			Object.assign(transcript, { entries: new Map(saved.entries.map((entry) => [entry.id, entry])), usage: saved.usage, agent: saved.agent });
			live.current.ready = true;
			draw();
		};
		let closed = false;
		let source: EventSource;
		let retry: ReturnType<typeof setTimeout> | undefined;
		let wait = RETRY_MS;
		const open = () => {
			source = new EventSource(address);
			source.onopen = () => {
				wait = RETRY_MS;
				live.current.connected = true;
				draw();
			};
			source.onmessage = receive;
			// EventSource reconnects by itself after a dropped stream, but gives up for good on an answer that isn't 200, such
			// as tailscale serve's 502 while gaidin restarts; then a new one is opened, waiting longer each time. gaidin starts
			// every connection with a snapshot, so the conversation catches up either way.
			source.onerror = () => {
				live.current.connected = false;
				draw();
				if (!current && !restoring) void restore();
				if (source.readyState !== EventSource.CLOSED) return;
				retry = setTimeout(open, wait);
				wait = Math.min(wait * 2, MAX_RETRY_MS);
			};
		};
		const receive = (message: MessageEvent<string>) => {
			// SAFETY: gaidin sends each event as JSON (web.ts events()).
			const event = JSON.parse(message.data) as StreamEvent;
			applyEvent(live.current.transcript, event);
			if (event.type === "snapshot") current = live.current.ready = true;
			save();
			switch (event.type) {
				case "snapshot":
					// A (re)connection may have missed changes.
					invalidate(["approvals"], ["activity-by-agent"], ["conversations", agent]);
					break;
				case "run_start":
					invalidate(["activity-by-agent"]);
					break;
				case "run_end":
					invalidate(["activity-by-agent"], ["usage"], ["budget"], ["reminders", agent], ["jobs", agent], ["conversations", agent]);
					// A thread's title and preview come from gaidin's index of its messages.
					if (conversation !== undefined) invalidate(["conversation", conversation]);
					break;
				case "entry_appended":
					if (event.entry.kind === "gaidin.reminder-fired") invalidate(["reminders", agent]);
					// A job run reports here when it's done, and the run is one of the agent's conversations.
					if (event.entry.kind === "gaidin.job-reported") invalidate(["jobs", agent], ["conversations", agent]);
					break;
				case "agent_changed":
					invalidate(["settings", agent]);
					break;
				case "approvals_changed":
					invalidate(["approvals"]);
					break;
			}
			heard.current?.(event, live.current.transcript);
			draw();
		};
		const reopen = () => {
			clearTimeout(retry);
			source.close();
			wait = RETRY_MS;
			live.current.connected = false;
			draw();
			open();
		};
		// A phone suspends the app in the background and its stream with it. Back in front, the stream may be waiting out a
		// retry or, after a while, still say it's open over a connection that's gone, so it's opened again at once.
		let hiddenAt = 0;
		const shown = () => {
			if (document.visibilityState === "hidden") {
				hiddenAt = Date.now();
				return save(0);
			}
			if (source.readyState !== EventSource.OPEN || Date.now() - hiddenAt > STALE_MS) reopen();
		};
		const online = () => {
			if (source.readyState !== EventSource.OPEN) reopen();
		};
		open();
		void restore();
		document.addEventListener("visibilitychange", shown);
		window.addEventListener("online", online);
		return () => {
			closed = true;
			clearTimeout(retry);
			clearTimeout(saving);
			if (saving !== undefined) keep();
			source.close();
			cancelAnimationFrame(frame);
			document.removeEventListener("visibilitychange", shown);
			window.removeEventListener("online", online);
		};
	}, [agent, conversation, queryClient]);

	return state;
}
