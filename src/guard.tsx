// Unsaved edits on the pages: a guard that asks before the app navigates away or the page unloads while an editor
// holds changes, and drafts kept in sessionStorage (under the composer's prefix) for the long ones.
import { useBlocker } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";

const DRAFT = "moiraine.draft:";

/**
 * Asks before leaving while `dirty`: in the app with `dialog`, which the editor renders, and on a reload or closing
 * the tab with the browser's own prompt. `release` lets the next navigation through, for one the editor makes itself
 * once its text is saved or given up.
 */
export function useLeaveGuard(dirty: boolean): { dialog: ReactNode; release: () => void } {
	const released = useRef(false);
	const blocker = useBlocker({ shouldBlockFn: () => dirty && !released.current, enableBeforeUnload: () => dirty && !released.current, withResolver: true });
	const dialog =
		blocker.status === "blocked" ? (
			<div className="page-problem leave-guard" role="alertdialog" aria-label="Unsaved changes">
				<p>You have changes that aren't saved. Leaving drops them.</p>
				<div className="form-bar">
					<button className="plain" type="button" autoFocus onClick={blocker.reset}>
						stay
					</button>
					<button className="danger" type="button" onClick={blocker.proceed}>
						leave
					</button>
				</div>
			</div>
		) : null;
	return {
		dialog,
		release: () => {
			released.current = true;
		},
	};
}

/**
 * Text being edited, kept in sessionStorage as `key` while it differs from `initial`, so a reload brings it back.
 * It is undefined until the text is touched, then follows `initial` no more; setting undefined, or `initial`, drops it.
 */
export function useKeptDraft(key: string, initial: string): [string | undefined, (text: string | undefined) => void] {
	const [draft, set] = useState<string | undefined>(() => {
		const kept = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(DRAFT + key);
		return kept === null || kept === initial ? undefined : kept;
	});
	return [
		draft,
		(text) => {
			set(text);
			if (text === undefined || text === initial) sessionStorage.removeItem(DRAFT + key);
			else sessionStorage.setItem(DRAFT + key, text);
		},
	];
}
