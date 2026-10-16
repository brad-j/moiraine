// The app's box is what's visible, from visualViewport, rather than 100dvh. iOS ignores interactive-widget, so when
// the keyboard opens it pans the page under it instead of resizing, and installed on the home screen it can keep the
// keyboard's smaller height and the pan after the keyboard closes, leaving the composer mid-screen over a black gap.
// Following the visual viewport puts the composer on the keyboard while it's up and at the bottom once it's down.

/** How much shorter than the tallest seen the view has to be to count as the keyboard being up, in CSS pixels. */
const KEYBOARD = 120;

/** Keeps --app-top and --app-height on what's visible and `keyboard` on the root while it's up; returns the undo. */
export function followViewport(): () => void {
	const view = window.visualViewport;
	if (view === null) return () => undefined;
	const root = document.documentElement;
	let width = 0;
	let tallest = 0;
	const update = () => {
		// Pinched in, the visible part is a piece of the page, not the space the app has.
		if (Math.abs(view.scale - 1) > 0.01) return;
		// The tallest is per width, so turning the phone doesn't read as a keyboard.
		if (view.width !== width) [width, tallest] = [view.width, 0];
		tallest = Math.max(tallest, view.height);
		root.style.setProperty("--app-top", `${view.offsetTop}px`);
		root.style.setProperty("--app-height", `${view.height}px`);
		root.classList.toggle("keyboard", tallest - view.height > KEYBOARD);
		// The page itself never scrolls: only the log, the pages and the sidebar do.
		if (window.scrollY !== 0) window.scrollTo(0, 0);
	};
	// iOS settles the viewport after the keyboard's animation, a little after the field loses focus.
	let settle: ReturnType<typeof setTimeout> | undefined;
	const later = () => {
		clearTimeout(settle);
		settle = setTimeout(update, 300);
	};
	update();
	view.addEventListener("resize", update);
	view.addEventListener("scroll", update);
	window.addEventListener("focusout", later);
	window.addEventListener("pageshow", update);
	return () => {
		clearTimeout(settle);
		view.removeEventListener("resize", update);
		view.removeEventListener("scroll", update);
		window.removeEventListener("focusout", later);
		window.removeEventListener("pageshow", update);
	};
}
