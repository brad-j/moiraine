// Requests to gaidin's HTTP API, typed by its route tables in gaidin's src/web.ts. The import is types only, so
// none of gaidin's code is in the build; a changed answer there fails tsc here.
import type { AVATAR_PATH as ServerAvatarPath, FILE_HEADER as ServerFileHeader, Gets, LIVE_PATH as ServerLivePath, LiveEvent, Posts, PROTOCOL as ServerProtocol, StreamEvent, Uploaded } from "gaidin/src/web.ts";

import { noteAnswer } from "./offline.ts";

export type { Gets, LiveEvent, Posts, StreamEvent, Uploaded };
/** The owner's input to a profile they've taken over. */
export type LiveInput = Posts["/api/browser/input"]["body"]["events"][number];

/** The protocol version this build is typed against; tsc fails here when gaidin raises it. */
export const PROTOCOL: typeof ServerProtocol = 15;
/** Where gaidin serves an agent's picture, with ?id= and &v=, its name. */
export const AVATAR_PATH: typeof ServerAvatarPath = "/api/agents/avatar";
/** Where gaidin streams a browser profile's live view, with ?profile=. */
export const LIVE_PATH: typeof ServerLivePath = "/api/browser/live";
/** The tools a rule's `path inside <folder>` can cover, as gaidin's rules.ts has them; never workspace_run. */
export const INSIDE_TOOLS = ["workspace_read", "workspace_write", "workspace_edit"];
/** The header that names a file sent to /api/files, as gaidin reads it. */
const FILE_HEADER: typeof ServerFileHeader = "X-Gaidin-File";

// The conversation's parts, as the event stream carries them.
type EventOf<T extends StreamEvent["type"]> = Extract<StreamEvent, { type: T }>;
export type Snapshot = EventOf<"snapshot">;
export type Entry = Snapshot["entries"][number];
export type Usage = Snapshot["usage"];
export type AgentState = Snapshot["agent"];
export type Message = NonNullable<Entry["model"]>[number];
export type AssistantMessage = Extract<Message, { role: "assistant" }>;
export type ToolResult = Extract<Message, { role: "toolResult" }>;
export type Block = AssistantMessage["content"][number];
export type MessageChange = EventOf<"message_update">["changes"][number];

export type Agent = Gets["/api/agents"][number];
export type Approval = Gets["/api/approvals"][number];
export type Settings = Gets["/api/settings"];
export type Summary = Gets["/api/conversations"]["items"][number];
export type Connector = Gets["/api/connectors"][number];
export type Rule = Gets["/api/rules"]["rules"][number];
export type RuleGrant = Gets["/api/rules"]["grants"][number];
export type NewRule = Posts["/api/rules/add"]["body"];

/** A GET of one of gaidin's routes, with `query` after it. */
export async function load<P extends keyof Gets>(path: P, query = ""): Promise<Gets[P]> {
	const response = await fetch(path + query);
	noteAnswer(response);
	if (!response.ok) throw new Error(`${path}: ${await response.text()}`);
	// SAFETY: gaidin's route table is checked against Gets, so the route answers with Gets[P].
	return response.json() as Promise<Gets[P]>;
}

/** A POST to one of gaidin's routes, with the body it takes. */
export async function post<P extends keyof Posts>(path: P, body: Posts[P]["body"]): Promise<Posts[P]["answer"]> {
	const response = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) throw new Error(`${path}: ${await response.text()}`);
	// SAFETY: gaidin's route table is checked against Posts, so the route answers with Posts[P]["answer"].
	return response.json() as Promise<Posts[P]["answer"]>;
}

/** Sends a file ahead of the message that names it, by the id this answers with. */
export async function upload(file: Blob, name: string): Promise<Uploaded> {
	const response = await fetch("/api/files", {
		method: "POST",
		headers: { [FILE_HEADER]: encodeURIComponent(name), "Content-Type": file.type || "application/octet-stream" },
		body: file,
	});
	if (!response.ok) throw new Error(`/api/files: ${await response.text()}`);
	// SAFETY: gaidin answers /api/files with an Uploaded.
	return response.json() as Promise<Uploaded>;
}

/** What went wrong in a request, without the route in front. */
export function problem(error: unknown): string {
	return error instanceof Error ? error.message.replace(/^\/api\/[\w/]+: /, "") : String(error);
}

/** A request's id, so a message sent again isn't answered twice. randomUUID exists only on secure pages (HTTPS or localhost). */
export function requestId(): string {
	if (crypto.randomUUID instanceof Function) return crypto.randomUUID();
	return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}
