---
name: research-document-organizer
description: Turn source material into a structured, citation-safe document. Use when organizing research notes, literature, interview transcripts, or web sources into a report, brief, article, or outline, or when auditing a draft for missing evidence and invented claims.
---

# Research Document Organizer

Build documents that a careful researcher can defend. Keep evidence, interpretation, and uncertainty separate.

## Trigger

Use this skill when asked to:

- organize notes or sources into a report, brief, article, or outline
- restructure a draft without changing its evidence
- find unsupported claims, missing sources, or citation gaps
- convert research material into Markdown for import into a document editor
- audit a research document before publication

Do not use it to fabricate sources, citations, quotes, statistics, or metadata. Do not use it for copy-editing alone; use a proofreading workflow instead.

## Rules

1. **Preserve provenance.** Keep every supplied URL, title, author, date, and direct quote attached to the claim it supports.
2. **Never invent.** If a fact is not in the supplied material, write `[missing]` or `[unverified]`. Do not use general knowledge to fill gaps.
3. **Separate layers.** Mark facts, interpretation, and open questions distinctly. Do not present inference as evidence.
4. **Quote exactly.** Copy direct quotations verbatim, including punctuation. Do not silently normalize names, numbers, or dates.
5. **Surface conflict.** When sources disagree, show both claims and the disagreement instead of picking a side without evidence.
6. **Keep edits visible.** When restructuring, preserve the original meaning and wording of quoted material.
7. **Prefer portable output.** Return Markdown that survives import: headings, paragraphs, flat lists, pipe tables, block quotes, links, and standalone image URLs.

## Workflow

### 1. Intake

- List every source with title, publisher or author, date, URL, and access date.
- Mark missing metadata as `[missing]`.
- Extract claims with a locator (page, section, paragraph, timestamp) where available.
- Record direct quotes separately from paraphrase.

### 2. Map

- State the document's purpose in one sentence and its intended reader.
- Group claims by theme, not by source.
- Build a heading hierarchy with one purpose per section.
- Put unresolved conflicts and gaps in a dedicated section.

### 3. Draft

- Lead each section with its claim, then the evidence.
- Link inline citations to their source URLs.
- Keep paragraphs focused; one main claim per paragraph.
- Use tables only when rows share the same fields.
- Use block quotes only for exact quotations, with attribution.

### 4. Verify

Check each item before handing off:

- Every factual claim has a source or an `[unverified]` label.
- Every URL is copied exactly and resolves to the cited source.
- Every quotation appears verbatim in the source.
- Numbers and dates match the source.
- No source appears in the reference list that was not used.
- The outline has no duplicate or overlapping sections.
- The document states its limits and open questions.

### 5. Hand off

Return Markdown with this shape:

```markdown
# Title

One-paragraph purpose and scope.

## Section

Claim with an [inline source](https://example.com).

> Exact quotation.
> — Author, *Title*, date

## Limits and open questions

- [unverified] Claim that still needs a source.
- Conflict between Source A and Source B.

## Sources

1. Author. *Title*. Publisher, date. https://example.com
```

Then tell the user what changed, what remains unsupported, and which sources were not used.

## Quality bar

A reader should be able to trace every important sentence back to a named source, see where the evidence stops, and import the result without losing links, headings, or quotations.
