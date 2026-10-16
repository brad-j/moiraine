import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IconContext } from "@phosphor-icons/react";
import { ClientOnly, createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import styles from "../styles.css?url";
import { followViewport } from "../viewport.ts";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1, interactive-widget=resizes-content, viewport-fit=cover" },
			{ name: "color-scheme", content: "dark" },
			// --color-paper (tokens.css) in hex, which the browser's own bars take.
			{ name: "theme-color", content: "#050505" },
			// On the home screen, iOS draws the page under the status bar, which the safe-area insets keep it clear of.
			{ name: "mobile-web-app-capable", content: "yes" },
			{ name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
			{ title: "moiraine" },
		],
		links: [
			{ rel: "stylesheet", href: styles },
			// The .ico for browsers that ask for it by name or don't take SVG icons, then the SVG for those that do.
			{ rel: "icon", href: "/favicon.ico", sizes: "32x32" },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			{ rel: "manifest", href: "/manifest.webmanifest" },
		],
	}),
	shellComponent: Document,
	component: Root,
});

/** Phosphor's icons, as design.md has them: 16 pixels, its regular weight, in the color of what they're in. */
const ICONS = { size: 16, weight: "regular", color: "currentColor" } as const;

function Root() {
	const { queryClient } = Route.useRouteContext();
	// The service worker shows notifications, and a short page when gaidin can't be reached.
	useEffect(() => {
		if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => console.error("The service worker didn't start:", error));
	}, []);
	useEffect(followViewport, []);
	return (
		<QueryClientProvider client={queryClient}>
			<IconContext.Provider value={ICONS}>
				{/* The shell is built ahead with no route in it; the routes render once it's hydrated, so the two always match. */}
				<ClientOnly>
					<Outlet />
				</ClientOnly>
			</IconContext.Provider>
		</QueryClientProvider>
	);
}

function Document({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
