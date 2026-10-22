# Copy audit — improve-copy skill, batch mode

Applied with the **`improve-copy`** skill (`@majiayu000/improve-copy`, `dcode:improve-copy`),
installed locally at [`skills/improve-copy/SKILL.md`](../skills/improve-copy/SKILL.md).
Canonical install: `npx skills add https://www.modelscope.cn/skills/@majiayu000/improve-copy`
(in the authoring sandbox ModelScope is unreachable, so the skill file was installed from its
GitHub source, `majiayu000/claude-skill-registry` → `skills/data/improve-copy`, with identical content).

**Mode:** Audit → Batch (skill rule: > 10 items → batch table, not one-by-one walkthrough).
**Scope:** every user-facing string in `index.html`, `src/ui/*`, `src/App.tsx` (no changes needed),
plus the error/warning strings those screens surface from `src/import/*`, `src/export/*`, and
`src/storage/repository.ts`. Copy only — no layout, CSS, component, or behavior changes.
**Result:** ~130 strings rewritten across 22 files. Typecheck clean, 40/40 tests pass, production build succeeds.

---

## Voice calibration (skill: Voice Dimensions + Contextual Tone)

This is a credibility product — its promise is "a document you can defend" — so the playful end of the
skill's spectrum was deliberately **not** used.

| Dimension | Setting for this product |
| --- | --- |
| Formal ↔ Casual | Middle-formal, with contractions ("Couldn't…") replacing "could not be" |
| Serious ↔ Playful | Serious. No "Oops", no exclamation marks |
| Respectful ↔ Irreverent | Respectful |
| Matter-of-fact ↔ Enthusiastic | Matter-of-fact; success is brief and names the outcome |

Contextual tones applied: onboarding/hero = warm and benefit-led · success = brief outcome
("PDF downloaded — checked and valid.") · error = calm + next step · destructive = consequence first,
no softening · empty state = encouraging + the action that fills it.

### Terminology rules adopted (skill: 4th C — Consistent)

| Concept | One term | Replaced variants |
| --- | --- | --- |
| Where work lives | **on this device** | locally, in local storage, in IndexedDB, local-first |
| Adding to a document | **add (to the end of…)** | append |
| Checking an export | **checked** (before download) | validated, validation (in headings/notes) |
| Import processing | the thing found / what will import | extraction (in headings/buttons) |
| Library item / open file | **project** in the library, **document** once open/exported | used interchangeably before |
| Inspector image store | **Media** (matches the tab) | media registry, registry (in button labels) |
| Failure | **Couldn't…** | could not be…, failed (bare), was not (except test-pinned phrases) |

Test-pinned phrases kept verbatim so behavior contracts hold: `no longer exists`, `not saved`,
`could not be read` (DOCX), `could not be opened` (PDF), `No readable content` (HTML),
`no content blocks` / `embedded image` / `PDF header` (export validation).

---

## The five headline improvements

1. **JTBD format choice (Export dialog).** The user's real job is *"which file do I want?"* — so the
   format cards now answer it: PDF = *"Best for sharing and printing…"*, DOCX = *"Best for handing to
   an editor…"* instead of feature inventories.
2. **Errors now end with a way out.** Every bare "X could not be Y" became
   `[what happened] · [why, if known] · [what to do]` — e.g. autosave failure now tells you your words
   are still on screen, to keep the tab open, and to retry with **Save now**.
3. **Empty states point somewhere.** The barest one — "No sources registered." — now follows the
   skill's formula: *"No sources yet. Add one above, or import content and its links will be recorded
   for you."* Same for the outline, Imports, and Media panels.
4. **Consequence-first confirmations.** Delete-project and remove-source dialogs lead with what will
   happen and what survives, and only then ask the question.
5. **Placeholders teach instead of repeating labels.** "Heading" → "Section heading…", alt text →
   "Describe it for someone who can't see it", quotes → "Paste the passage word for word…" (which also
   reinforces the product's quote-exactly rule).

### Bugs the audit found (not just style)

| Where | Problem | Fix |
| --- | --- | --- |
| Storage quota error | Told users to *"Download a project backup"* — no backup feature exists | "Export anything you need to keep, then delete old projects…" |
| PDF scanned-file error | Internal jargon leaked: *"OCR is not supported in this MVP"* | "Run it through OCR to make a text version, then import that." |
| Markdown / text import | Whitespace-only **files** were told *"The pasted content / text file is empty"* (wrong in half the entry paths) | Neutral: "There is no readable text to import. Paste or choose content with text in it." |
| `src/import/shared.ts` | A second, unused `assetStatusLabel` with the old labels (drift trap) | Synced to the same four labels as `src/ui/format.ts` |
| Export summaries | `image warning(s)` lazy plural; `PDF export failed: msg..` double period | Real plurals; trailing period de-duplicated |

---

## Batch table — buttons, headings & CTAs (JTBD / benefit-first / action-first)

| Where | Before | After | Framework |
| --- | --- | --- | --- |
| Page `<title>` | … — local-first document workspace | … — turn research into a document you can defend | Benefit-first, matches H1 |
| Brand subhead | Local-first writing workspace | Documents that never leave your device | JTBD (privacy outcome), Clear |
| Hero paragraph | Import research, keep every original and source, shape it… export a validated PDF… | Keep every original… attached while you shape… then download a checked PDF… Nothing leaves this browser. | Benefit-first, Concise |
| Hero formats line | MD · HTML · TXT · DOCX · text PDF · paste · drag and drop | Works with MD · HTML · TXT · DOCX · text-based PDF — or just paste, or drop a file anywhere | Action-first |
| Hero side card | What is preserved (+ 4 passive items) | **What you never lose** (+ outcome items, e.g. "A chance to check warnings before anything is imported") | JTBD |
| Empty-library secondary CTA | Create blank | New blank document (same words as hero) | Consistent |
| Dashboard footer | PDF and DOCX exports are validated from the generated bytes… | Every PDF and Word export is checked before it downloads — an invalid file never reaches you. | Benefit-first, Clear (no "bytes") |
| Import dialog eyebrow | Add source material (duplicated the H2) | Nothing is added until you confirm | Benefit (safety) |
| File picker | Choose file | Choose a file to preview | JTBD (outcome: preview) |
| Paste CTA | Preview extraction | Preview what will import | JTBD, Clear |
| Preview eyebrow | Extraction preview | Import preview · check what was found | Clear |
| Target radio | Append to the current document | Add to the end of this document | Clear (no "append") |
| Confirm CTA | Append import / Create project | Add to this document / Create new project | Action-first, Consistent |
| Export eyebrow + H2 | Delivery / Export document | Checked before you get it / Export a file you can share | JTBD |
| Export result (ok) | Validated export | Your file passed every check | Success tone: brief outcome |
| Export result (bad) | Export needs attention | This file didn't pass — here's why | Error tone: calm, sets up detail |
| Block hints (×7) | Body text · Structured data · Stored locally · Reference link… | Write your main text · Compare rows of data · Add a figure, saved locally · Link to a video (never embedded)… | JTBD outcomes, sets expectations |
| Inspector: theme label | PDF / DOCX theme | Export style (PDF & Word) | Clear |
| Inspector: source list | Append a source list to exports | Add a source list at the end of exports | Clear |
| Inspector: imports CTA | + Add import | + Import more research | Consistent verb phrase |
| Inspector: image URL | Image URL (fallback / remote) | Or link to an image on the web | Action-first label |
| Inspector: detach | Detach saved image | Unlink saved image (kept in Media) | Consequence-clarifying |
| Media: insert | Insert image block | Add to document | JTBD |
| Topbar eyebrow | Local project | Project · stays on this device | Benefit, Consistent term |
| Save state | Save failed / Saved locally | Couldn't save / Saved on this device | Conversational, Consistent |
| Canvas note | autosaves after a short pause | autosaves a moment after you stop typing | Conversational, precise |
| Add-bar hint | after selected block | goes after the selected block | Clear grammar |
| Drop overlay (×2) | Drop to preview an import / Drop to import research | Drop to see what will import (one phrase, both screens) | JTBD, Consistent |
| Image status (×4) | Remote URL · Unresolved · Retrieval failed · Saved locally | Linked from the web · No working source · Couldn't be fetched · Saved on this device | Clear, Consistent |

## Batch table — empty states ("No X yet. [Action] to [benefit].")

| Where | Before | After |
| --- | --- | --- |
| Project library | Import a document or start blank. Your work is stored in IndexedDB on this device. | Import research to turn it into an editable, source-backed document, or start from a blank page. Everything is saved only on this device. |
| Editor outline | Headings you add will form the outline. Select any heading to jump to it. | No headings yet. Add a heading block and it will appear here, so you can jump between sections. |
| Inspector · Imports | No imports yet. Source files and originals will be listed here. | No imports yet. Import research and each untouched original will be kept here, ready to download. |
| Inspector · Sources | No sources registered. | No sources yet. Add one above, or import content and its links will be recorded for you. |
| Inspector · Media | No media assets yet. Import an HTML or DOCX file, or upload an image. | No media yet. Import an HTML or DOCX file with images, or upload an image to reuse across blocks. |
| Inspector · Block (none selected) | Select a block… to edit its type-specific settings and see provenance. | Select any block to adjust its settings and see where it came from. |
| Block provenance | No linked sources on this block. Links inside its text remain in the source list when imported. | No sources are linked to this block yet. Links found at import still appear under Sources. |
| Print preview (empty) | This document has no content yet. | Nothing to print yet — this document is empty. |
| Import preview sample | (empty) · Plus N more blocks. | (empty block) · …and N more blocks you'll see after importing. |

## Batch table — confirmations ("[Consequence]. [Question]?")

| Where | Before | After |
| --- | --- | --- |
| Delete project | Delete "X"? This removes the project from this browser. Download any export you need first. | "X" will be removed from this browser and can't be recovered. Export a copy first if you still need it. ⏎ Delete this project? |
| Remove source | Remove this source? Citations keep their own label, quote and URL. | This source will be removed from the list. Citations keep their own label, quote and URL, so no document text is lost. ⏎ Remove this source? |

Native `window.confirm` button labels (OK/Cancel) can't be customized — noted as a known limit; a
future custom dialog should label them "Delete project" / "Keep it".

## Batch table — errors ("[What happened] [Why] [What to do]") & warnings

Representative rows; the same pattern was applied to every fallback toast in Dashboard/Editor
(create, duplicate, delete, save, image store ×2, download-original).

| Where | Before | After |
| --- | --- | --- |
| Drag wrong file type (×2 screens) | Use Markdown, HTML, TXT, DOCX or a text-based PDF. | **That file type can't be imported.** Use Markdown, HTML, TXT, DOCX or a text-based PDF. |
| Import too large | This file is 42 MB. The limit is 25 MB. | This file is 42 MB — over the 25 MB limit. Split it, or paste just the section you need. |
| Import unreadable file | The file could not be imported. | Couldn't read that file. Check it opens elsewhere, then try again. |
| Import save failed | The import could not be saved. | Couldn't save the import. **Your preview is still here** — try again. |
| Autosave failed | Autosave failed. | Couldn't autosave. Keep this tab open and use Save now to retry — **your words are still on screen.** |
| Storage full | Local storage is full… Download a project backup… | …browser storage on this device is full. Export anything you need to keep, then delete old projects or large images and try again. |
| Storage blocked | …Private browsing can disable IndexedDB. | …your browser blocked local saving, which private or incognito windows often do. Try a regular window… |
| Original gone | The original import is no longer in local storage. | That original file is no longer stored here. **Your document's blocks are unaffected** — only the untouched original is gone. |
| Export invalid | Export validation failed. Nothing was downloaded. | The exported file didn't pass its checks, so nothing was downloaded. See what to fix below. |
| Export empty doc | Add content before exporting. Empty documents are blocked by validation. | There's nothing to export yet. Add at least one block, then come back — empty documents can't be exported. |
| DOCX damaged | The DOCX file could not be read. ⟨raw library message⟩ | The DOCX file could not be read — it may be damaged. Try re-exporting it from Word, then import again. (detail) |
| PDF damaged/locked | The PDF file could not be opened. ⟨raw⟩ | …could not be opened — it may be damaged or password-protected. Try a fresh, unlocked copy. (detail) |
| PDF scanned | …OCR is not supported in this MVP. | …it is probably scanned images. Run it through OCR to make a text version, then import that. |
| PDF headings warning | …were inferred from text size and may need correction. | …were **guessed** from text size — check them in the outline and fix any that look wrong. |
| PDF missing pages | …They may be scanned images. | …they may be scanned images. If those pages matter, OCR them and import the text. |
| HTML relative link | …kept as text because no base URL was available to resolve it. | …kept as plain text — without the page's full web address it can't be made clickable in exports. |
| HTML image unresolved | …was kept as unresolved: ⟨url⟩ | …couldn't be linked because its address is incomplete or unsupported: ⟨url⟩. It is kept as a placeholder — add a file or a full web address on the block to show it. |
| Export image missing | A locally saved image file is missing from browser storage. The export shows a placeholder. | A saved image file is missing from this browser, so a placeholder is exported instead. Re-upload the image on its block to include it. |
| Export image format | GIF images are not supported by PDF export; a placeholder is shown instead. | GIF images can't go into a PDF, so a placeholder is shown instead. Convert the image to PNG or JPEG to include it. |
| PDF font failure | Built-in PDF fonts cover Latin text only; unsupported characters can cause this failure. | The built-in PDF fonts cover Latin text only — remove unsupported characters (such as emoji or non-Latin script), **or export DOCX instead.** |
| Unsafe export link | A citation has a URL that is not http(s) or mailto… | A citation links to an address that isn't a web (http/https) or email link, so it appears as plain text — not clickable — in exports. |
| Dashboard load error | Local storage could not be read. | Couldn't load your projects. (+ detail + existing Try again button) |

## Batch table — loading, success & placeholders

| Type | Before → After (examples) |
| --- | --- |
| Loading | Creating… → **Starting your document…** · Opening project from local storage… → **Opening your project…** · Loading image… → **Loading your image…** · Exporting… → **Building your PDF…** · "Resolving images, writing the PDF, and validating the package…" → **"Gathering images, building your PDF, and checking the file before download…"** |
| Success (brief outcome) | PDF exported and validated. → **PDF downloaded — checked and valid.** · Appended 12 blocks and 3 sources. → **Added 12 blocks and 3 sources to the end of this document.** (with correct singulars) · Prompt copied to clipboard. → **Prompt copied — paste it into your assistant.** · Image added to the media registry. → **Image saved to Media — insert it into the document from there.** · Duplicated "X". → **Duplicated as "X copy".** |
| Placeholders | Heading → **Section heading…** · List item → **New point…** · Describe the image → **Describe it for someone who can't see it** · Video title → **Video title (shown to readers)** · Source label → **Source label — e.g. author, year or publication** · Quoted passage → **Exact quoted passage** · Callout text → **The one thing readers must not miss…** · Quoted text → **Paste the passage word for word…** · Attribution → **Who said it?** |

---

## Kept as-is (already pass the skill's checks — changing them would be churn)

- **"Turn source material into a document you can defend."** — model JTBD headline; everything else was aligned to it.
- **"Generate and download PDF"** — action + outcome in one button.
- **"Clipboard access was blocked. Select the text and copy manually."** — textbook error pattern.
- **"Where should this go?"** (import target legend) — conversational and clear.
- **"Start writing, or drag in source material."** (paragraph placeholder) — teaches two real paths.
- **"Alt text (required for accessibility)"** — benefit stated in the label.
- Most HTML-import warnings ("Images inside table cells were removed from the table. Add them as image
  blocks if needed.") already follow what/why/what-to-do.
- Compact topbar verbs (**Import**, **Export**, **Print preview**, **Refresh**) — space-constrained
  navigation; the dialogs they open now carry the outcome language.
- DOCX/PDF **validation diagnostics** ("The DOCX package is missing word/document.xml") — precise
  technical language is correct for a "here's why" details list; only the framing copy changed.
- AI prompt bodies in `src/ai/prompts.ts` — functional instructions to another model, governed by the
  `research-document-organizer` skill, not UI microcopy. Surrounding UI copy was improved instead.

## Deliberately out of scope

Layout, styling, and interaction design are untouched — this skill improves the words the design
already presents. Follow-ups worth deciding separately: custom confirmation dialogs (so buttons can say
"Delete project"), and removing the now-synced duplicate `assetStatusLabel` in `src/import/shared.ts`.

## How to review or revert

- Full diff: `git diff` on this branch (22 source files, copy-only; `dist/` untouched — rebuild to ship).
- Revert one surface without touching the rest: `git checkout <base> -- src/ui/ExportDialog.tsx` etc.
- Re-run the audit after UI changes: ask an agent to apply `skills/improve-copy/SKILL.md` in
  `-audit --batch` mode to the changed files, using the voice/terminology tables above as constraints.
