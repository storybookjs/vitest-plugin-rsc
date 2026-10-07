const scriptStart = "<script";

/**
 * Up to where `html`, the part of a document that has arrived, can go to a
 * parser without leaving a `<script>` open. The text of a script is only all
 * there once its end tag is, and a script that runs with half of it is lost.
 */
export function endOfCompleteScripts(html: string): number {
  const lower = html.toLowerCase();
  const open = lower.lastIndexOf(scriptStart);
  if (open > lower.lastIndexOf("</script")) return open;
  // The start tag itself can be cut off: `<scr`.
  for (let length = scriptStart.length - 1; length > 0; length--) {
    if (lower.endsWith(scriptStart.slice(0, length))) return html.length - length;
  }
  return html.length;
}
