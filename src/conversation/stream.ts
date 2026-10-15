// A conversation, live: its event stream from gaidin's /events, kept by the transcript reducer, drawn at most once a
// frame. The events also refresh the queries they affect.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { StreamEvent } from "../api.ts";
import { applyEvent, newTranscript, type Transcript } from "../transcript.ts";

/** Which conversation: an agent's home, or `conversation` by id. */
export type Target = { agent: string; conversation?: number };

/** `onEvent` hears each event after the transcript has it. */
export function useConversation(target: Target, onEvent?: (event: StreamEvent, transcript: Transcript) => void): { transcript: Transcript; connected: boolean } {
	const queryClient = useQueryClient();
	const [state, setState] = useState(() => ({ transcript: newTranscript(), connected: false }));
	const { agent, conversation } = target;
	// The transcript is changed in place, many times a frame while text streams in; a new state object draws it.
	const live = useRef(state);
	const heard = useRef(onEvent);
	useEffect(() => {
		heard.current = onEvent;
	});

	useEffect(() => {
		live.current = { transcript: newTranscript(), connected: false };
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
		const source = new EventSource(`/events?${conversation === undefined ? `agent=${encodeURIComponent(agent)}` : `conversation=${conversation}`}`);
		source.onopen = () => {
			live.current.connected = true;
			draw();
		};
		source.onmessage = (message) => {
			// SAFETY: gaidin sends each event as JSON (web.ts events()).
			const event = JSON.parse(message.data) as StreamEvent;
			applyEvent(live.current.transcript, event);
			switch (event.type) {
				case "snapshot":
					// A (re)connection may have missed changes.
					invalidate(["approvals"]);
					break;
				case "run_end":
					invalidate(["usage"], ["budget"], ["reminders", agent], ["jobs", agent], ["conversations", agent]);
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
		// EventSource reconnects by itself, and gaidin starts every connection with a snapshot.
		source.onerror = () => {
			live.current.connected = false;
			draw();
		};
		return () => {
			source.close();
			cancelAnimationFrame(frame);
		};
	}, [agent, conversation, queryClient]);

	return state;
}
