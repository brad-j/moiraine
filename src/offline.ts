// What the app shows when gaidin can't be reached: the API's last answers, which the service worker (public/sw.js)
// keeps and marks, and each conversation's last transcript, kept here, since its event stream can't be.
import { useSyncExternalStore } from "react";
import type { AgentState, Entry, Usage } from "./api.ts";
import type { Transcript } from "./transcript.ts";

/** The header sw.js puts on an answer it kept, with when it kept it in ms. */
export const SAVED_AT = "X-Moiraine-Saved-At";
const TRANSCRIPTS = "moiraine-transcripts";
/** How many conversations' transcripts are kept; the ones saved longest ago go first. */
const MAX_TRANSCRIPTS = 30;

let savedAt: number | undefined;
const listeners = new Set<() => void>();

/** Notes whether an answer came from what was saved, and when, or from gaidin. */
export function noteAnswer(response: Response) {
	const header = response.headers.get(SAVED_AT);
	// A failure that wasn't answered from what was saved says nothing either way.
	if (header === null && !response.ok) return;
	const at = header === null ? undefined : Number(header);
	if (at === savedAt) return;
	savedAt = at;
	for (const listener of listeners) listener();
}

/** When what's shown was saved, while gaidin can't be reached; undefined while it can. */
export function useSavedAt(): number | undefined {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => savedAt,
	);
}

type Saved = { at: number; entries: Entry[]; usage: Usage | undefined; agent: AgentState | undefined };

const transcriptKey = (key: string) => `/saved/transcript?${key}`;
const store = () => (typeof caches === "undefined" ? Promise.resolve(undefined) : caches.open(TRANSCRIPTS));

/** Keeps the conversation `key`'s transcript, what it has written down, for when gaidin can't be reached. */
export async function saveTranscript(key: string, transcript: Transcript) {
	const cache = await store();
	if (cache === undefined) return;
	const saved: Saved = { at: Date.now(), entries: [...transcript.entries.values()], usage: transcript.usage, agent: transcript.agent };
	// Put last, so the keys run oldest first.
	await cache.delete(transcriptKey(key));
	await cache.put(transcriptKey(key), new Response(JSON.stringify(saved), { headers: { "Content-Type": "application/json" } }));
	const keys = await cache.keys();
	for (const old of keys.slice(0, Math.max(0, keys.length - MAX_TRANSCRIPTS))) await cache.delete(old);
}

/** The conversation `key`'s kept transcript, if there is one. */
export async function savedTranscript(key: string): Promise<Saved | undefined> {
	const hit = await (await store())?.match(transcriptKey(key));
	// SAFETY: only saveTranscript writes this cache, as a Saved.
	return hit === undefined ? undefined : ((await hit.json()) as Saved);
}
