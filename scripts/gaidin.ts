// gaidin's e2e server from the checkout beside this one: a scripted model with no keys and a fresh data directory,
// removed when it stops. See gaidin's e2e/server.ts for what the model does with each message. With `app`, it serves
// that build of moiraine.
import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

/** The tailnet login the e2e server lets in. */
export const USER = "brad@example.com";

export async function startGaidin(app?: string): Promise<{ base: string; child: ChildProcess; stop: () => Promise<void> }> {
	const child = spawn(process.execPath, ["--no-warnings", "e2e/server.ts", USER, ...(app === undefined ? [] : [resolve(app)])], {
		cwd: resolve(import.meta.dirname, "../../gaidin"),
		stdio: ["ignore", "pipe", "inherit"],
	});
	const port = await new Promise<string>((done, fail) => {
		child.once("exit", (code) => fail(new Error(`gaidin's e2e/server.ts exited with ${code}`)));
		createInterface({ input: child.stdout! }).on("line", (line) => {
			const match = /^port (\d+)$/.exec(line);
			if (match !== null) done(match[1]!);
		});
	});
	const stop = async () => {
		if (child.exitCode !== null) return;
		const exited = new Promise((done) => child.once("exit", done));
		child.kill("SIGTERM");
		await exited;
	};
	return { base: `http://127.0.0.1:${port}`, child, stop };
}
