/**
 * Heading-aware Markdown chunking for retrieval. Keeps the heading path with each chunk
 * and targets a word budget rather than exact tokens (no tokenizer dependency).
 */

export interface Chunk {
  ordinal: number;
  heading: string;
  content: string;
  wordCount: number;
}

export interface ChunkOptions {
  maxWords?: number;
  overlapWords?: number;
}

export function chunkMarkdown(markdown: string, title: string, opts: ChunkOptions = {}): Chunk[] {
  const maxWords = opts.maxWords ?? 220;
  const overlap = opts.overlapWords ?? 30;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: { heading: string; text: string[] }[] = [];
  const path: string[] = [];
  let current = { heading: title, text: [] as string[] };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      if (current.text.join(" ").trim()) sections.push(current);
      const level = m[1]!.length;
      path.splice(level - 1);
      path[level - 1] = m[2]!.trim();
      current = { heading: [title, ...path.filter(Boolean)].join(" > "), text: [] };
    } else {
      current.text.push(line);
    }
  }
  if (current.text.join(" ").trim()) sections.push(current);

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const words = section.text.join("\n").split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let start = 0;
    while (start < words.length) {
      const end = Math.min(words.length, start + maxWords);
      const slice = words.slice(start, end);
      chunks.push({ ordinal: chunks.length, heading: section.heading, content: slice.join(" "), wordCount: slice.length });
      if (end === words.length) break;
      start = end - overlap;
    }
  }
  return chunks;
}

/** Strip Markdown syntax for plain-text indexing and snippets. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
