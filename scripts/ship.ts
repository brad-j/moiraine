// `pnpm ship`: builds the app and copies it to gaidin's VM over Tailscale SSH, into /var/lib/gaidin/moiraine, which
// gaidin's web.app names. gaidin reads the shell each time it serves it, so there's nothing to restart.
//
// It stops when the VM's gaidin speaks another protocol than this build is typed against: deploy gaidin first (push,
// then setup.sh on the VM). Built files have hashed names; new ones are copied before the shell that names them, and
// old ones stay a while, so a page loaded before the copy still finds its files.
//
//   pnpm ship              build, check and copy
//   pnpm ship --dry-run    check, and say what would be copied
//
// GAIDIN_HOST is the SSH destination, default ubuntu@gaidin; it needs passwordless sudo there.
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { PROTOCOL } from "../src/api.ts";

const HOST = process.env.GAIDIN_HOST ?? "ubuntu@gaidin";
const TARGET = "/var/lib/gaidin/moiraine";
const SETTINGS = "/etc/gaidin/config.json";
const BUILD = resolve(import.meta.dirname, "../dist/client");
const dry = process.argv.includes("--dry-run");

/** Runs `script` on the VM with sh, and gives back what it printed. */
function remote(script: string): string {
	return execFileSync("ssh", ["-o", "BatchMode=yes", HOST, script], { encoding: "utf8" }).trim();
}

function fail(message: string): never {
	console.error(`ship: ${message}`);
	process.exit(1);
}

// What the VM's settings say about the web view, without printing any of them: its port and user go only into the
// request made there.
const web = remote(`sudo -n python3 -c 'import json; w = json.load(open("${SETTINGS}")).get("web", {}); print(w.get("port", 8410), w.get("app", ""), sep="\\t")'`);
const [port = "8410", app = ""] = web.split("\t");
const ask = (path: string) =>
	`sudo -n python3 -c 'import json; print(json.load(open("${SETTINGS}"))["web"]["user"])' | xargs -I{} curl -sS -H "Tailscale-User-Login: {}" -o /dev/stdout -w "\\n%{http_code}" http://127.0.0.1:${port}${path}`;

const version = remote(ask("/api/version")).split("\n");
const status = version.pop();
if (status !== "200") fail(`gaidin on ${HOST} didn't answer /api/version (HTTP ${status}): it's from before the app's protocol, so deploy gaidin first.`);
// SAFETY: gaidin answers /api/version with { protocol: number }; a missing one fails the check below.
const speaks = (JSON.parse(version.join("\n")) as { protocol?: number }).protocol;
if (speaks !== PROTOCOL) fail(`gaidin on ${HOST} speaks protocol ${speaks}, and this build is for ${PROTOCOL}. Deploy gaidin first: push it, then run setup.sh on the VM.`);
console.log(`gaidin on ${HOST} speaks protocol ${speaks}, as this build does.`);

if (!dry) {
	const built = spawnSync("pnpm", ["exec", "vite", "build"], { stdio: "inherit" });
	if (built.status !== 0) fail("the build failed.");
}

// Owned by root and readable by the service, as the checkout is.
const rsync = (from: string, to: string, extra: string[]) => {
	const args = ["-a", "--chown=root:gaidin", "--chmod=D755,F644", "--rsync-path=sudo -n rsync", ...(dry ? ["--dry-run", "--itemize-changes"] : []), ...extra, from, `${HOST}:${to}`];
	const copied = spawnSync("rsync", args, { stdio: "inherit" });
	if (copied.status !== 0) fail(`copying to ${HOST}:${to} failed.`);
};
if (!dry) remote(`sudo -n install -d -o root -g gaidin -m 755 ${TARGET}`);
// The files the shell names first, then the shell.
rsync(`${BUILD}/`, `${TARGET}/`, ["--exclude=_shell.html"]);
rsync(`${BUILD}/_shell.html`, `${TARGET}/_shell.html`, []);
if (!dry) {
	// Built files from builds over two weeks old go; any page still open has long since loaded its own.
	remote(`sudo -n find ${TARGET}/assets -type f -mtime +14 -delete`);
}

if (app !== TARGET) {
	console.log(`\nweb.app isn't set to ${TARGET} in ${SETTINGS}${app === "" ? "" : ` (it's ${app})`}. Add it to the "web" section:\n\n    "app": "${TARGET}"\n\nthen restart gaidin (sudo systemctl restart gaidin), which reads its settings at start.`);
} else if (!dry) {
	const shell = remote(ask("/app/")).split("\n").pop();
	if (shell !== "200") fail(`the build is copied, but gaidin didn't serve it at /app/ (HTTP ${shell}). It reads web.app at start: if that was just set, restart it (sudo systemctl restart gaidin).`);
	console.log(`The app is at /app/ on ${HOST}.`);
}
