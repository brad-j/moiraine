// Web Push for this device: the service worker (public/sw.js, served as /sw.js) holds the subscription and shows the
// notifications. From gaidin's web view's settings page.
import { post } from "./api.ts";

/** What kind of device this is, to tell the signed-up ones apart. */
export function deviceLabel(): string {
	const ua = navigator.userAgent;
	return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Linux";
}

/** Whether this browser can get notifications at all. */
export const supported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

/** The service worker's registration, made if there's none yet. */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
	if (!supported()) return undefined;
	return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** This device's push address, if it gets notifications. */
export async function thisDevice(): Promise<string | undefined> {
	if (!supported()) return undefined;
	return (await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription())?.endpoint;
}

/** Signs this device up for notifications, or throws with why not. */
export async function subscribeHere(publicKey: string) {
	// Asked before anything else, while the tap still counts: iOS allows the request only in answer to one.
	if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications aren't allowed for gaidin here. Allow them in the device's settings, then try again.");
	const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
	const worker = await registration();
	if (worker === undefined) throw new Error("This browser can't get notifications.");
	await navigator.serviceWorker.ready;
	const subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
	const { endpoint, keys } = subscription.toJSON();
	if (endpoint === undefined || keys?.p256dh === undefined || keys.auth === undefined) throw new Error("The browser didn't give a push address and keys for this device.");
	await post("/api/push/subscribe", { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, label: deviceLabel() });
}

/** Stops notifications to the device at `endpoint`, this one or another. */
export async function unsubscribe(endpoint: string) {
	await post("/api/push/unsubscribe", { endpoint });
	const here = await (await navigator.serviceWorker?.getRegistration("/"))?.pushManager.getSubscription();
	if (here?.endpoint === endpoint) await here.unsubscribe();
}
