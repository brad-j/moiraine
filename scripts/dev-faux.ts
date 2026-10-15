// `pnpm dev:faux`: the app against gaidin's e2e server from the checkout beside this one, which runs a scripted
// model with no keys and a fresh data directory, removed when it stops. See gaidin's e2e/server.ts for what the
// model does with each message.
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const USER = "brad@example.com";
const gaidin = spawn(process.execPath, ["--no-warnings", "e2e/server.ts", USER], {
	cwd: resolve(import.meta.dirname, "../../gaidin"),
	stdio: ["ignore", "pipe", "inherit"],
});
const port = await new Promise<string>((done, fail) => {
	gaidin.once("exit", (code) => fail(new Error(`gaidin's e2e/server.ts exited with ${code}`)));
	createInterface({ input: gaidin.stdout! }).on("line", (line) => {
		const match = /^port (\d+)$/.exec(line);
		if (match !== null) done(match[1]!);
	});
});
const vite = spawn("pnpm", ["exec", "vite", "dev", ...process.argv.slice(2)], {
	stdio: "inherit",
	env: { ...process.env, GAIDIN_URL: `http://127.0.0.1:${port}`, GAIDIN_WEB_USER: USER },
});
const stop = () => {
	vite.kill("SIGTERM");
	gaidin.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.once("exit", (code) => {
	gaidin.kill("SIGTERM");
	process.exitCode = code ?? 0;
});
