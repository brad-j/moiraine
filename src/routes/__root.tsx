import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClientOnly, createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import styles from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1, interactive-widget=resizes-content, viewport-fit=cover" },
			{ name: "color-scheme", content: "dark" },
			// --color-paper (tokens.css) in hex, which the browser's own bars take.
			{ name: "theme-color", content: "#0a0a0a" },
			{ title: "gaidin" },
		],
		links: [
			{ rel: "stylesheet", href: styles },
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
			{ rel: "manifest", href: "/manifest.webmanifest" },
		],
	}),
	shellComponent: Document,
	component: Root,
});

function Root() {
	const { queryClient } = Route.useRouteContext();
	// The service worker shows notifications, and a short page when gaidin can't be reached.
	useEffect(() => {
		if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => console.error("The service worker didn't start:", error));
	}, []);
	return (
		<QueryClientProvider client={queryClient}>
			{/* The shell is built ahead with no route in it; the routes render once it's hydrated, so the two always match. */}
			<ClientOnly>
				<Outlet />
			</ClientOnly>
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
