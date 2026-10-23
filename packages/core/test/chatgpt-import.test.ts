import { describe, expect, it } from "vitest";
import { formatTranscript, parseChatGptExport } from "../src/chatgpt-import";

const sample = [
  {
    id: "conv-1",
    title: "Router RT-AX1800 dropping wifi",
    create_time: 1700000000,
    current_node: "n4",
    mapping: {
      root: { id: "root", parent: null, message: null },
      n1: { id: "n1", parent: "root", message: { author: { role: "system" }, content: { content_type: "text", parts: ["system text"] } } },
      n2: { id: "n2", parent: "n1", message: { author: { role: "user" }, create_time: 1700000001, content: { content_type: "multimodal_text", parts: [{ asset_pointer: "file-service://x" }, "my router RT-AX1800 drops wifi, call me 012-345 6789"] } } },
      n3: { id: "n3", parent: "n2", message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["Try updating firmware."] } } },
      n3b: { id: "n3b", parent: "n2", message: { author: { role: "assistant" }, content: { content_type: "text", parts: ["(abandoned branch)"] } } },
      n4: { id: "n4", parent: "n3", message: { author: { role: "user" }, content: { content_type: "text", parts: ["thanks"] } } },
    },
  },
  { id: "conv-2", title: "Recipe ideas", current_node: "a", mapping: { a: { id: "a", parent: null, message: { author: { role: "user" }, content: { content_type: "text", parts: ["nasi lemak recipe"] } } } } },
  { nonsense: true },
];

describe("ChatGPT export parser", () => {
  const r = parseChatGptExport(sample);
  it("keeps only the main thread, user and assistant text", () => {
    const c = r.conversations[0]!;
    expect(c.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(c.messages.some((m) => m.text.includes("abandoned"))).toBe(false);
  });
  it("scrubs personal data and counts missing attachments", () => {
    const c = r.conversations[0]!;
    expect(c.messages[0]!.text).toContain("[phone]");
    expect(c.messages[0]!.text).not.toContain("012-345");
    expect(c.attachmentsMissing).toBe(1);
  });
  it("tags relevance, categories and model mentions", () => {
    expect(r.conversations[0]!.relevant).toBe(true);
    expect(r.conversations[0]!.categories).toEqual(["router"]);
    expect(r.conversations[0]!.modelMentions).toContain("RTAX1800");
    expect(r.conversations[1]!.relevant).toBe(false);
  });
  it("reports invalid records and produces stable hashes", () => {
    expect(r.invalid).toBe(1);
    expect(r.total).toBe(3);
    expect(parseChatGptExport(sample).conversations[0]!.contentSha256).toBe(r.conversations[0]!.contentSha256);
  });
  it("labels transcripts as unverified", () => {
    expect(formatTranscript(r.conversations[0]!)).toMatch(/^UNVERIFIED HISTORICAL CONVERSATION/);
  });
});
