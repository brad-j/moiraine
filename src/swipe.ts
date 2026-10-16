// On a phone the sidebar follows a finger, as a native app's drawer does: a swipe right across the conversation pulls
// it open, a swipe left pushes it closed, and letting go settles it open or closed by how far and how fast it went.
import { type RefObject, useEffect, useRef } from "react";

/** Where the sidebar is a drawer; the same width as styles.css's. */
export const DRAWER = "(max-width: 760px)";
/** How far a finger moves, in pixels, before it's told whether it's a swipe or a scroll. */
const DECIDE = 10;
/** How fast a swipe has to be when it's let go, in pixels a millisecond, to settle the way it went however far it got. */
const FLING = 0.4;

/** Lets `app`'s sidebar be swiped open and closed while it's a drawer; `open` is where it is, `setOpen` moves it. */
export function useSwipe(app: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
	// Read when a swipe starts, so the app drawing again, as it does every few seconds, doesn't drop one under way.
	const isOpen = useRef(open);
	useEffect(() => {
		isOpen.current = open;
	});
	useEffect(() => {
		const root = app.current;
		const sidebar = root?.querySelector<HTMLElement>("#sidebar");
		const scrim = root?.querySelector<HTMLElement>(".scrim");
		if (!root || !sidebar || !scrim) return;
		let start: { x: number; y: number } | undefined;
		let dragging = false;
		let open = false;
		let width = 0;
		let shown = 0;
		let last = { x: 0, at: 0, speed: 0 };

		const down = (event: TouchEvent) => {
			start = undefined;
			const touch = event.touches[0];
			if (event.touches.length !== 1 || touch === undefined || !matchMedia(DRAWER).matches) return;
			// A swipe in something that scrolls sideways, or on the live view of a browser, is that thing's.
			if (sideways(event.target, root) || (event.target instanceof Element && event.target.closest("canvas"))) return;
			start = { x: touch.clientX, y: touch.clientY };
			open = isOpen.current;
			last = { x: touch.clientX, at: event.timeStamp, speed: 0 };
			dragging = false;
		};
		const move = (event: TouchEvent) => {
			const touch = event.touches[0];
			if (start === undefined || touch === undefined) return;
			const dx = touch.clientX - start.x;
			const dy = touch.clientY - start.y;
			if (!dragging) {
				if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
				// Mostly sideways, and toward where the sidebar can go; anything else is a scroll.
				if (Math.abs(dx) < Math.abs(dy) * 1.5 || (open ? dx > 0 : dx < 0)) return void (start = undefined);
				dragging = true;
				width = sidebar.offsetWidth;
				root.classList.add("swiping");
			}
			event.preventDefault();
			const elapsed = event.timeStamp - last.at;
			if (elapsed > 0) last = { x: touch.clientX, at: event.timeStamp, speed: (touch.clientX - last.x) / elapsed };
			shown = Math.min(width, Math.max(0, (open ? width : 0) + dx));
			sidebar.style.transform = `translateX(${shown - width}px)`;
			scrim.style.opacity = String(shown / width);
		};
		const up = () => {
			if (start === undefined || !dragging) return void (start = undefined);
			start = undefined;
			dragging = false;
			const to = Math.abs(last.speed) > FLING ? last.speed > 0 : shown > width / 2;
			setOpen(to);
			// Let go once the drawer's class is on, so it slides on from where the finger left it.
			requestAnimationFrame(() => {
				root.classList.remove("swiping");
				sidebar.style.transform = "";
				scrim.style.opacity = "";
			});
		};

		root.addEventListener("touchstart", down, { passive: true });
		// Not passive, so a swipe doesn't scroll the log as well.
		root.addEventListener("touchmove", move, { passive: false });
		root.addEventListener("touchend", up);
		root.addEventListener("touchcancel", up);
		return () => {
			root.removeEventListener("touchstart", down);
			root.removeEventListener("touchmove", move);
			root.removeEventListener("touchend", up);
			root.removeEventListener("touchcancel", up);
		};
	}, [app, setOpen]);
}

/** Whether `target`, or something it's in below `root`, scrolls sideways: a code block, a table, the status line. */
function sideways(target: EventTarget | null, root: Element): boolean {
	for (let at = target instanceof Element ? target : null; at !== null && at !== root; at = at.parentElement) {
		if (at.scrollWidth > at.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(at).overflowX)) return true;
	}
	return false;
}
