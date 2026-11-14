/**
 * Week notes are stored as HTML written by the notes editor. Notes saved before the editor
 * had formatting are plain text; they open as one paragraph per line and become HTML on the next save.
 */

/** HTML from the notes editor always starts with one of its top-level blocks. */
const RICH_TEXT = /^<(?:p|ul|ol)[\s>]/;

export function isRichText(notes: string) {
  return RICH_TEXT.test(notes);
}

export function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * One paragraph per line, the way the plain-text editor showed it.
 * Tabs and runs of spaces become non-breaking spaces so indentation survives HTML's whitespace collapsing.
 */
export function plainTextToHtml(text: string) {
  return text
    .split("\n")
    .map((line) => `<p>${escapeHtml(line.replace(/\t/g, "    ")).replace(/^ | (?= )/g, "&nbsp;")}</p>`)
    .join("");
}

/** The notes as HTML for the editor, whichever form they are stored in. */
export function notesToHtml(notes: string) {
  return isRichText(notes) ? notes : plainTextToHtml(notes);
}
