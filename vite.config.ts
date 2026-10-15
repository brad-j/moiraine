import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

// gaidin, which `pnpm dev` passes /api, /events and the icon to. It lets in only its web.user, which tailscale serve
// names in Tailscale-User-Login, and only POSTs whose Origin is its own, so the proxy sets both.
const target = process.env.GAIDIN_URL ?? "http://127.0.0.1:8410";
const proxy: ProxyOptions = {
	target,
	changeOrigin: true,
	headers: { "Tailscale-User-Login": process.env.GAIDIN_WEB_USER ?? "brad@example.com", Origin: target },
};

export default defineConfig({
	// gaidin serves the build at /app/ beside its web view, until the switch moves it to /.
	base: "/app/",
	plugins: [tanstackStart({ spa: { enabled: true } }), viteReact()],
	server: { proxy: { "/api": proxy, "/events": proxy, "/favicon.svg": proxy } },
});
