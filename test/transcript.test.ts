// The transcript reducer against a real event stream, from gaidin's e2e server (scripts/gaidin.ts).
import assert from "node:assert/strict";
import test from "node:test";
import type { StreamEvent } from "../src/api.ts";
import { startGaidin, USER } from "../scripts/gaidin.ts";
import { applyEvent, newTranscript, type Transcript } from "../src/transcript.ts";

/** A conversation's events as /events sends them, until `stop`. */
async function listen(base: string, query = "") {
	const response = await fetch(`${base}/events${query}`, { headers: { "Tailscale-User-Login": USER } });
	const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
	const events: StreamEvent[] = [];
	let buffer = "";
	const done = (async () => {
		for (;;) {
			const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
			if (done) return;
			buffer += value;
			let end: number;
			while ((end = buffer.indexOf("\n\n")) >= 0) {
				const frame = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);
				// SAFETY: gaidin sends each event as JSON.
				if (frame.startsWith("data: ")) events.push(JSON.parse(frame.slice(6)) as StreamEvent);
			}
		}
	})();
	return {
		events,
		until: async (check: (events: StreamEvent[]) => boolean, timeoutMs = 15_000) => {
			const end = Date.now() + timeoutMs;
			while (!check(events)) {
				if (Date.now() > end) throw new Error(`timed out with ${events.map((e) => e.type).join(", ")}`);
				await new Promise((r) => setTimeout(r, 20));
			}
		},
		stop: async () => {
			await reader.cancel();
			await done;
		},
	};
}

const replay = (events: readonly StreamEvent[]): Transcript => {
	const transcript = newTranscript();
	for (const event of events) applyEvent(transcript, event);
	return transcript;
};

/** What's kept of a transcript once a run is over. */
const settled = (t: Transcript) => ({ entries: [...t.entries.values()].sort((a, b) => a.id - b.id), running: t.running, partial: t.partial, tools: [...t.tools.values()], agent: t.agent });

test("replaying a run's events gives the conversation as it's stored", async (t) => {
	const gaidin = await startGaidin();
	const live = await listen(gaidin.base);
	t.after(async () => {
		await live.stop();
		await gaidin.stop();
	});
	await live.until((events) => events.length > 0);

	// A tool call, its result and an answer: the model sets a reminder, then says what came back.
	const sent = await fetch(`${gaidin.base}/api/message`, {
		method: "POST",
		headers: { "Tailscale-User-Login": USER, "Content-Type": "application/json" },
		body: JSON.stringify({ content: "remind me about the dentist", requestId: "r1" }),
	});
	assert.equal(sent.status, 200);
	await live.until((events) => events.some((e) => e.type === "run_end"));
	const replayed = replay(live.events);
	assert.ok(live.events.some((e) => e.type === "tool_execution_end"));

	// A page that connects now starts from the snapshot, which is the conversation as it's stored.
	const fresh = await listen(gaidin.base);
	await fresh.until((events) => events.length > 0);
	await fresh.stop();
	assert.deepEqual(settled(replayed), settled(replay(fresh.events)));
	const kinds = [...replayed.entries.values()].map((e) => e.kind);
	assert.ok(kinds.includes("pi.user") && kinds.includes("pi.assistant") && kinds.includes("pi.tool-result"), kinds.join());
});
