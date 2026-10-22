import type { Document } from '../model/schema'
import { documentStats, outlineFromDocument } from '../editor/operations'
import { inlineHtmlToPlainText } from '../model/inline'

export const ORGANIZER_SKILL_PATH = 'skills/research-document-organizer/SKILL.md'

const OUTPUT_RULES = `Return Markdown only. Use #, ## and ### headings, - lists, pipe tables and > quotes. Keep every source URL exactly as supplied. Mark uncertainty as [unverified]. Never invent a citation, quote, author, date or statistic.`

export function buildStructurePrompt(document: Document): string {
  const stats = documentStats(document)
  const outline = outlineFromDocument(document)
  const sourceLines = document.sources
    .slice(0, 40)
    .map((source, index) => `${index + 1}. ${source.label || source.title || 'Untitled source'} — ${source.url || 'no URL'}`)
  const sectionLines = outline.map((heading) => `${'  '.repeat(Math.max(0, heading.level - 1))}- ${inlineHtmlToPlainText(heading.html) || 'Untitled heading'}`)

  return `You are editing a research document. Follow the workflow in ${ORGANIZER_SKILL_PATH}: preserve provenance, separate evidence from interpretation, and improve structure without inventing facts.

Current document: "${document.title}"
${stats.words} words, ${stats.blocks} blocks, ${stats.sources} sources, ${stats.citations} citations.

Current outline:
${sectionLines.length ? sectionLines.join('\n') : '- (no headings yet)'}

Known sources:
${sourceLines.length ? sourceLines.join('\n') : '- (none recorded)'}

Task:
1. Identify the strongest argument and the gaps in the current structure.
2. Propose a revised heading hierarchy with a one-line purpose for each section.
3. List claims that need evidence and the sources that should support them.
4. Rewrite the outline as a compact Markdown brief, ready to paste back into the studio as an import.

${OUTPUT_RULES}`
}

export function buildDraftPrompt(document: Document): string {
  const outline = outlineFromDocument(document)
    .slice(0, 30)
    .map((heading) => `- ${inlineHtmlToPlainText(heading.html) || 'Untitled heading'}`)

  return `You are drafting from supplied research material. Follow ${ORGANIZER_SKILL_PATH}. Do not add facts that are not in the sources I provide.

Document title: "${document.title}"
Outline I am working from:
${outline.length ? outline.join('\n') : '- (freeform draft)'}

I will paste source notes after this prompt. Build a document with:
- a short purpose statement
- headings that follow the outline
- paragraphs that cite sources inline as Markdown links
- a "Sources" section containing only the URLs I supplied
- a "Limits and open questions" section for gaps and conflicts in the evidence

${OUTPUT_RULES}`
}

export function buildSourceIntakePrompt(): string {
  return `You are preparing research notes for import into a document studio. Follow ${ORGANIZER_SKILL_PATH}.

For each source I provide:
1. Capture the exact title, author or publisher, date, URL and access date.
2. Extract only claims that the source actually supports, with a short direct quote where useful.
3. Label each claim as fact, interpretation or uncertainty.
4. Note contradictions with other sources.
5. End with a short Markdown summary using headings, lists and a source table.

Do not fill gaps with background knowledge. If metadata is missing, write [missing].

${OUTPUT_RULES}`
}
