import { z } from "zod";
import { detectCategory, extractModelCandidates, normalizeText } from "./text";
import { scrubPersonalData } from "./privacy";
import { sha256Hex } from "./security";
import { detectPromptInjection } from "./files";

/**
 * Parser for the ChatGPT data export (conversations.json). Only the main thread (from
 * current_node back to the root) is kept. Text parts are scrubbed of personal data. Images and
 * other attachments are not present in conversations.json; they are counted and reported as
 * missing rather than silently ignored. Nothing produced here is treated as verified knowledge.
 */

const node = z.object({
  id: z.string(),
  parent: z.string().nullish(),
  message: z
    .object({
      author: z.object({ role: z.string() }),
      create_time: z.number().nullish(),
      content: z.object({ content_type: z.string(), parts: z.array(z.unknown()).nullish() }).passthrough(),
    })
    .passthrough()
    .nullish(),
});

const conversation = z.object({
  id: z.string().optional(),
  conversation_id: z.string().optional(),
  title: z.string().nullish(),
  create_time: z.number().nullish(),
  update_time: z.number().nullish(),
  current_node: z.string().nullish(),
  mapping: z.record(z.string(), node),
});

export interface ImportedMessage { role: "user" | "assistant"; text: string; at: string | null }
export interface ImportedConversation {
  externalId: string;
  title: string;
  createdAt: string | null;
  messages: ImportedMessage[];
  attachmentsMissing: number;
  categories: ("router" | "laptop")[];
  modelMentions: string[];
  injectionFlags: number;
  contentSha256: string;
  relevant: boolean;
}

export interface ParseReport {
  conversations: ImportedConversation[];
  invalid: number;
  total: number;
}

const iso = (t: number | null | undefined) => (typeof t === "number" ? new Date(t * 1000).toISOString() : null);

export function parseChatGptExport(raw: unknown, opts: { keywords?: string[] } = {}): ParseReport {
  const list = Array.isArray(raw) ? raw : [];
  const out: ImportedConversation[] = [];
  let invalid = 0;
  const keywords = (opts.keywords ?? []).map((k) => normalizeText(k)).filter(Boolean);
  for (const item of list) {
    const parsed = conversation.safeParse(item);
    if (!parsed.success) {
      invalid++;
      continue;
    }
    const c = parsed.data;
    const chain: z.infer<typeof node>[] = [];
    let cursor = c.current_node ?? null;
    const guard = new Set<string>();
    while (cursor && c.mapping[cursor] && !guard.has(cursor)) {
      guard.add(cursor);
      chain.push(c.mapping[cursor]!);
      cursor = c.mapping[cursor]!.parent ?? null;
    }
    chain.reverse();
    const messages: ImportedMessage[] = [];
    let attachmentsMissing = 0;
    for (const n of chain) {
      const m = n.message;
      if (!m || (m.author.role !== "user" && m.author.role !== "assistant")) continue;
      const parts = m.content.parts ?? [];
      const texts = parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
      attachmentsMissing += parts.filter((p) => typeof p !== "string").length;
      if (texts.length === 0) continue;
      messages.push({ role: m.author.role, text: scrubPersonalData(texts.join("\n")).slice(0, 20_000), at: iso(m.create_time) });
    }
    if (messages.length === 0) continue;
    const all = `${c.title ?? ""}\n${messages.map((m) => m.text).join("\n")}`;
    const category = detectCategory(all);
    const categories: ("router" | "laptop")[] = category ? [category] : (["router", "laptop"] as const).filter((k) => new RegExp(`\\b${k}\\b`, "i").test(all));
    const norm = normalizeText(all);
    const relevant = categories.length > 0 || keywords.some((k) => norm.includes(k));
    out.push({
      externalId: c.id ?? c.conversation_id ?? sha256Hex(all).slice(0, 32),
      title: scrubPersonalData(c.title ?? "Untitled").slice(0, 200),
      createdAt: iso(c.create_time),
      messages,
      attachmentsMissing,
      categories,
      modelMentions: extractModelCandidates(all).slice(0, 20),
      injectionFlags: detectPromptInjection(all).length,
      contentSha256: sha256Hex(messages.map((m) => `${m.role}:${normalizeText(m.text)}`).join("\n")),
      relevant,
    });
  }
  return { conversations: out, invalid, total: list.length };
}

/** Plain-text transcript for a staged source, labelled as unverified historical content. */
export function formatTranscript(c: ImportedConversation): string {
  const header = `UNVERIFIED HISTORICAL CONVERSATION (imported ChatGPT export). Not authoritative. Review against manufacturer documentation before reuse.\nTitle: ${c.title}\nDate: ${c.createdAt ?? "unknown"}\nAttachments not included in export: ${c.attachmentsMissing}\n`;
  return `${header}\n${c.messages.map((m) => `[${m.role === "user" ? "Question" : "Previous answer"}] ${m.text}`).join("\n\n")}`;
}
