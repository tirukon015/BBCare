import { Fragment, type ReactNode } from "react";

/** Stable id for a heading (shared with the table of contents). */
export const headingId = (text: string) => text.toLowerCase().replace(/[*`_]/g, "").replace(/[^a-z0-9\u00C0-\u024F]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "section";

/**
 * Minimal, safe Markdown renderer for reviewed knowledge content. Supports headings,
 * paragraphs, lists, blockquotes, bold, italics and inline code. Raw HTML and links to
 * external sites are not rendered as HTML (link text only), which prevents XSS and
 * accidental outbound links from article bodies.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) out.push(<Fragment key={k}>{tok.slice(1, tok.indexOf("]"))}</Fragment>);
    else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, skipSampleNotes = false }: { source: string; skipSampleNotes?: boolean }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const key = `b${n++}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      blocks.push(level === 2 ? <h2 key={key} id={headingId(h[2]!)} className="scroll-mt-24">{inline(h[2]!, key)}</h2> : <h3 key={key}>{inline(h[2]!, key)}</h3>);
      i++;
      continue;
    }
    if (/^#\s+/.test(line)) {
      i++;
      continue; // Article titles are rendered by the page, not the body.
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) quote.push(lines[i++]!.replace(/^>\s?/, ""));
      if (!skipSampleNotes) blocks.push(<blockquote key={key}>{inline(quote.join(" "), key)}</blockquote>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*]\s+/, ""));
      blocks.push(<ul key={key}>{items.map((t, j) => <li key={j}>{inline(t, `${key}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(<ol key={key} className="steps">{items.map((t, j) => <li key={j}>{inline(t, `${key}-${j}`)}</li>)}</ol>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,4}\s|>|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }
  return <div className="prose-bb">{blocks}</div>;
}
