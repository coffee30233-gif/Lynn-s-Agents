/**
 * Defensive backstop for ChatBubble/CouncilResults, which render replies as
 * plain text (no markdown renderer). The system prompt already tells models
 * not to use Markdown, but that's a request, not a guarantee — this strips
 * whatever slips through so raw #/** never show up in the UI.
 */
export function stripMarkdown(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let l = line;
      l = l.replace(/^(\s*)#{1,6}\s+/, "$1"); // "## Heading" -> "Heading"
      l = l.replace(/^(\s*)[-*]\s+\[[xX]\]\s+/, "$1☑ "); // "- [x] " -> "☑ "
      l = l.replace(/^(\s*)[-*]\s+\[\s?\]\s+/, "$1☐ "); // "- [ ] " -> "☐ "
      l = l.replace(/^(\s*)[-*]\s+/, "$1• "); // "- item" / "* item" -> "• item"
      return l;
    })
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1") // "**bold**" -> "bold"
    .replace(/__(.+?)__/g, "$1") // "__bold__" -> "bold"
    .replace(/`([^`]+)`/g, "$1"); // "`code`" -> "code"
}
