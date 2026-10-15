// Requests to gaidin's HTTP API, typed by its route tables in gaidin's src/web.ts. The import is types only, so
// none of gaidin's code is in the build; a changed answer there fails tsc here.
import type { Gets, Posts } from "gaidin/src/web.ts";

/** A GET of one of gaidin's routes, with `query` after it. */
export async function load<P extends keyof Gets>(path: P, query = ""): Promise<Gets[P]> {
	const response = await fetch(path + query);
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
