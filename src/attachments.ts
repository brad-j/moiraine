// Files going with a message. Each is sent to gaidin as soon as it's added, so it's ready when the message is, and the
// message names them by the ids gaidin gave. An image over what the model takes is made smaller here first.
import { useRef, useState } from "react";
import { problem, upload } from "./api.ts";

/** gaidin sends an image this size or smaller to the model; a bigger one is saved as a file instead. */
export const MAX_IMAGE = 3_750_000;
/** gaidin takes files up to this size. */
export const MAX_FILE = 20_000_000;

export type Attachment = {
	key: number;
	name: string;
	size: number;
	/** An image's picture, for its chip. */
	preview?: string;
	state: "sending" | "ready" | "failed";
	/** gaidin's id for it, once it's sent. */
	id?: string;
	problem?: string;
};

/**
 * An image small enough for the model: scaled down and saved as JPEG until it's under `max`. One already small enough,
 * or one the browser can't read, is given back as it is.
 */
export async function shrink(file: File, max = MAX_IMAGE): Promise<File> {
	if (file.size <= max || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return file;
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return file;
	}
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (context === null) return file;
	// Area shrinks roughly with size, so start at the square root of the ratio, and go down from there.
	let scale = Math.min(1, Math.sqrt(max / file.size));
	for (let tries = 0; tries < 6; tries++) {
		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
		if (blob !== null && blob.size <= max) {
			bitmap.close();
			return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
		}
		scale *= 0.7;
	}
	bitmap.close();
	return file;
}

/** A small picture of an image for its chip, as a data: URL, which the page's policy allows where blob: isn't. */
async function thumbnail(file: File, side = 72): Promise<string | undefined> {
	try {
		const bitmap = await createImageBitmap(file);
		const canvas = document.createElement("canvas");
		canvas.width = side;
		canvas.height = side;
		// Cropped to a square from the middle, as the chip shows it.
		const crop = Math.min(bitmap.width, bitmap.height);
		canvas.getContext("2d")?.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, side, side);
		bitmap.close();
		return canvas.toDataURL("image/jpeg", 0.8);
	} catch {
		return undefined;
	}
}

/** The files going with the next message: adding sends each to gaidin; `ids` are the ready ones'. */
export function useAttachments() {
	const [items, setItems] = useState<Attachment[]>([]);
	const next = useRef(0);

	const change = (key: number, update: Partial<Attachment>) => setItems((now) => now.map((a) => (a.key === key ? { ...a, ...update } : a)));

	function add(files: Iterable<File>) {
		for (const file of files) {
			const key = next.current++;
			const item: Attachment = { key, name: file.name || "file", size: file.size, state: "sending" };
			setItems((now) => [...now, item]);
			if (file.type.startsWith("image/")) void thumbnail(file).then((preview) => preview !== undefined && change(key, { preview }));
			void (async () => {
				try {
					const sent = await shrink(file);
					if (sent.size > MAX_FILE) throw new Error(`It's over ${MAX_FILE / 1_000_000} MB.`);
					const { id } = await upload(sent, sent.name || "file");
					change(key, { state: "ready", id, size: sent.size });
				} catch (error) {
					change(key, { state: "failed", problem: problem(error) });
				}
			})();
		}
	}

	function remove(key: number) {
		setItems((now) => now.filter((a) => a.key !== key));
	}

	return {
		items,
		add,
		remove,
		clear: () => setItems([]),
		/** Still being sent: the message waits for them. */
		sending: items.some((a) => a.state === "sending"),
		ids: items.flatMap((a) => (a.state === "ready" && a.id !== undefined ? [a.id] : [])),
	};
}
