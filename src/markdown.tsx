// Enough Markdown for model answers: fences, headings, lists, quotes, tables, rules, and inline code, emphasis and
// links. gaidin's web/markdown.ts, building React elements: nothing in a message is read as markup.
import { type CSSProperties, memo, type ReactNode } from "react";

const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([^*][\s\S]*?)\*\*|__([^_][\s\S]*?)__|~~([\s\S]+?)~~|!?\[([^\]]+)\]\(<?((?:[^()\s<>]|\([^()\s]*\))+)>?\)|<?(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"\]])>?|\*([^*\s](?:[^*]*[^*\s])?)\*|(?<![\w])_([^_\s](?:[^_]*[^_\s])?)_(?![\w])/g;

function inline(text: string): ReactNode[] {
	const out: ReactNode[] = [];
	let last = 0;
	for (const m of text.matchAll(INLINE)) {
		const index = m.index ?? 0;
		if (index > last) out.push(text.slice(last, index));
		last = index + m[0].length;
		const key = out.length;
		if (m[1] !== undefined) out.push(<code key={key}>{m[2]!.replace(/^ (.*) $/, "$1")}</code>);
		else if (m[3] !== undefined || m[4] !== undefined) out.push(<strong key={key}>{inline(m[3] ?? m[4]!)}</strong>);
		else if (m[5] !== undefined) out.push(<s key={key}>{inline(m[5])}</s>);
		else if (m[6] !== undefined) out.push(link(key, m[7]!, m[6]));
		else if (m[8] !== undefined) out.push(link(key, m[8]));
		else out.push(<em key={key}>{inline(m[9] ?? m[10]!)}</em>);
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}

/** A link to an http(s) or mailto address; anything else is shown as its label. A label holding a URL stays plain, so links don't nest. */
function link(key: number, href: string, label?: string): ReactNode {
	if (!/^(https?:|mailto:)/i.test(href)) return label ?? href;
	return (
		<a key={key} href={href} target="_blank" rel="noopener noreferrer">
			{label === undefined || /https?:\/\//.test(label) ? (label ?? href) : inline(label)}
		</a>
	);
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** A model's answer, parsed again only when its text changes. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
	return <div className="md">{blocks(text.replace(/\r\n?/g, "\n").split("\n"))}</div>;
});

function cells(row: string): string[] {
	return row.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function isTable(lines: string[], i: number): boolean {
	return lines[i]!.includes("|") && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1]!);
}

function startsBlock(lines: string[], i: number): boolean {
	const line = lines[i]!;
	return FENCE.test(line) || HEADING.test(line) || RULE.test(line) || ITEM.test(line) || QUOTE.test(line) || isTable(lines, i);
}

function blocks(lines: string[]): ReactNode[] {
	const out: ReactNode[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!;
		const key = out.length;
		if (line.trim() === "") {
			i++;
			continue;
		}
		const fence = FENCE.exec(line);
		if (fence) {
			// An unclosed fence runs to the end, which is what a streaming answer looks like mid-block.
			const close = new RegExp(`^ {0,3}${fence[1]![0]}{${fence[1]!.length},}\\s*$`);
			const body: string[] = [];
			for (i++; i < lines.length && !close.test(lines[i]!); i++) body.push(lines[i]!);
			i++;
			out.push(
				<pre key={key}>
					<code data-lang={fence[2] || undefined}>{body.join("\n")}</code>
				</pre>,
			);
			continue;
		}
		const heading = HEADING.exec(line);
		if (heading) {
			const level = heading[1]!.length;
			const Tag = level <= 2 ? "h3" : level === 3 ? "h4" : "h5";
			out.push(<Tag key={key}>{inline(heading[2]!)}</Tag>);
			i++;
			continue;
		}
		if (RULE.test(line)) {
			out.push(<hr key={key} />);
			i++;
			continue;
		}
		if (QUOTE.test(line)) {
			const body: string[] = [];
			for (; i < lines.length && lines[i]!.trim() !== "" && QUOTE.test(lines[i]!); i++) body.push(QUOTE.exec(lines[i]!)![1]!);
			out.push(<blockquote key={key}>{blocks(body)}</blockquote>);
			continue;
		}
		if (isTable(lines, i)) {
			const align = cells(lines[i + 1]!).map((c): CSSProperties | undefined => (c.endsWith(":") ? { textAlign: c.startsWith(":") ? "center" : "right" } : undefined));
			const head = cells(line);
			const rows: string[][] = [];
			for (i += 2; i < lines.length && lines[i]!.includes("|") && lines[i]!.trim() !== ""; i++) rows.push(cells(lines[i]!));
			out.push(
				<div key={key} className="table">
					<table>
						<thead>
							<tr>
								{head.map((text, n) => (
									<th key={n} style={align[n]}>
										{inline(text)}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{rows.map((row, r) => (
								<tr key={r}>
									{row.map((text, n) => (
										<td key={n} style={align[n]}>
											{inline(text)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>,
			);
			continue;
		}
		const item = ITEM.exec(line);
		if (item) {
			const [node, next] = list(lines, i, item[1]!.length, key);
			out.push(node);
			i = next;
			continue;
		}
		// Line breaks inside a paragraph are kept: answers use them on purpose.
		const parts: ReactNode[] = [];
		for (let first = true; i < lines.length && lines[i]!.trim() !== "" && (first || !startsBlock(lines, i)); i++, first = false) {
			if (!first) parts.push(<br key={`br${i}`} />);
			parts.push(...inline(lines[i]!.trim()));
		}
		out.push(<p key={key}>{parts}</p>);
	}
	return out;
}

/** A list at `indent`; lines indented further belong to the item above them. Returns the list and the next line. */
function list(lines: string[], i: number, indent: number, key: number): [ReactNode, number] {
	const first = ITEM.exec(lines[i]!)!;
	const ordered = /\d/.test(first[2]!);
	const items: ReactNode[] = [];
	while (i < lines.length) {
		const item = ITEM.exec(lines[i]!);
		if (!item || item[1]!.length !== indent || /\d/.test(item[2]!) !== ordered) break;
		const body = [item[3]!];
		let loose = false;
		for (i++; i < lines.length; i++) {
			const line = lines[i]!;
			const leading = line.length - line.trimStart().length;
			if (line.trim() === "") {
				// A blank line ends the item; the list goes on if the next text is another item or indented under this one.
				const next = lines.slice(i + 1).find((l) => l.trim() !== "");
				if (next === undefined || next.length - next.trimStart().length <= indent) break;
				body.push("");
				loose = true;
			} else if (leading > indent) body.push(line.slice(Math.min(leading, indent + 2)));
			else if (ITEM.test(line) || startsBlock(lines, i)) break;
			else body.push(line.trim());
		}
		let content: ReactNode[];
		if (body.length === 1) content = inline(body[0]!);
		else {
			content = blocks(body);
			// A tight item's first paragraph sits inline, so the bullet lines up with its text.
			const lead = content[0];
			if (!loose && isParagraph(lead)) content = [lead.props.children, ...content.slice(1)];
		}
		items.push(<li key={items.length}>{content}</li>);
		if (lines[i]?.trim() === "") {
			let next = i;
			while (next < lines.length && lines[next]!.trim() === "") next++;
			const following = next < lines.length ? ITEM.exec(lines[next]!) : null;
			if (following && following[1]!.length === indent) i = next;
		}
	}
	const start = ordered && parseInt(first[2]!) !== 1 ? parseInt(first[2]!) : undefined;
	return [ordered ? <ol key={key} start={start}>{items}</ol> : <ul key={key}>{items}</ul>, i];
}

function isParagraph(node: ReactNode): node is { type: "p"; props: { children: ReactNode } } & ReactNode {
	return typeof node === "object" && node !== null && "type" in node && node.type === "p";
}
