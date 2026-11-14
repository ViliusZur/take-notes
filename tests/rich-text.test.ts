import { describe, expect, it } from "vitest";
import { isRichText, notesToHtml, plainTextToHtml } from "@/lib/rich-text";

describe("notes format", () => {
  it("tells editor HTML from plain-text notes", () => {
    expect(isRichText("<p>Hi</p>")).toBe(true);
    expect(isRichText("<ul><li><p>One</p></li></ul>")).toBe(true);
    expect(isRichText('<ol start="3"><li><p>Three</p></li></ol>')).toBe(true);
    expect(isRichText("")).toBe(false);
    expect(isRichText("Plain notes")).toBe(false);
    expect(isRichText("<3 the team")).toBe(false);
    expect(isRichText("<pre>not ours</pre>")).toBe(false);
  });

  it("opens plain text as one paragraph per line, escaped, keeping indentation", () => {
    expect(plainTextToHtml("Groceries\n\n  - milk & <eggs>\n\tdone")).toBe(
      "<p>Groceries</p><p></p><p>&nbsp; - milk &amp; &lt;eggs&gt;</p><p>&nbsp;&nbsp;&nbsp; done</p>",
    );
    expect(notesToHtml("")).toBe("<p></p>");
    expect(notesToHtml("<p><strong>Kept</strong></p>")).toBe("<p><strong>Kept</strong></p>");
  });
});
