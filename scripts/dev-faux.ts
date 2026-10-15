// `pnpm dev:faux`: the app against gaidin's e2e server (scripts/gaidin.ts), with Vite's dev server in front.
import { spawn } from "node:child_process";
import { startGaidin, USER } from "./gaidin.ts";

const gaidin = await startGaidin();
const vite = spawn("pnpm", ["exec", "vite", "dev", ...process.argv.slice(2)], {
	stdio: "inherit",
	env: { ...process.env, GAIDIN_URL: gaidin.base, GAIDIN_WEB_USER: USER },
});
const stop = () => {
	vite.kill("SIGTERM");
	void gaidin.stop();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
vite.once("exit", (code) => {
	void gaidin.stop();
	process.exitCode = code ?? 0;
});
