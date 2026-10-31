import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Markdown } from "../src/components/markdown";

const html = (src: string) => renderToStaticMarkup(createElement(Markdown, { source: src }));

describe("safe markdown renderer", () => {
  it("renders headings, lists and emphasis", () => {
    const out = html("## Steps\n- **Unplug** the router\n- Wait `30s`");
    expect(out).toContain('<h2 id="steps" class="scroll-mt-24">Steps</h2>');
    expect(out).toContain("<strong>Unplug</strong>");
    expect(out).toContain("<code>30s</code>");
  });
  it("never emits raw HTML or script", () => {
    const out = html('Hello <script>alert(1)</script> <img src=x onerror="alert(2)">');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });
  it("renders link text without creating outbound links", () => {
    const out = html("[click](javascript:alert(1)) and [shop](https://evil.example)");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("click");
  });
});
