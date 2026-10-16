import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

// gaidin, which `pnpm dev` passes /api and /events to. It lets in only its web.user, which tailscale serve
// names in Tailscale-User-Login, and only POSTs whose Origin is its own, so the proxy sets both.
const target = process.env.GAIDIN_URL ?? "http://127.0.0.1:8410";
const proxy: ProxyOptions = {
	target,
	changeOrigin: true,
	headers: { "Tailscale-User-Login": process.env.GAIDIN_WEB_USER ?? "brad@example.com", Origin: target },
};

// precache.json: the build's files under assets/, which the service worker (public/sw.js) keeps so the app opens
// without the network. The .woff fonts are left out: every browser that runs a service worker takes the .woff2.
const precache: Plugin = {
	name: "moiraine-precache",
	applyToEnvironment: (environment) => environment.name === "client",
	writeBundle(options, bundle) {
		const files = Object.keys(bundle).filter((file) => file.startsWith("assets/") && !file.endsWith(".woff"));
		writeFileSync(join(options.dir ?? "dist/client", "precache.json"), JSON.stringify(files.map((file) => `/${file}`).sort()));
	},
};

export default defineConfig({
	plugins: [tanstackStart({ spa: { enabled: true } }), viteReact(), precache],
	server: { proxy: { "/api": proxy, "/events": proxy } },
});
