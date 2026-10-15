import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { load } from "../api.ts";

export const Route = createFileRoute("/")({ component: Home });

/** A stand-in until the sidebar and conversation exist: shows that the API answers. */
function Home() {
	const settings = useQuery({ queryKey: ["settings"], queryFn: () => load("/api/settings") });
	return (
		<main className="placeholder">
			<h1>gaidin</h1>
			{settings.isPending && <p>Connecting…</p>}
			{settings.isError && <p className="problem">{settings.error.message}</p>}
			{settings.data && (
				<p>
					Connected. Model <code>{settings.data.model}</code>, thinking {settings.data.thinkingLevel}.
				</p>
			)}
		</main>
	);
}
