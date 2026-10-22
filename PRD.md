# Product Requirements Document (PRD)
## Research-to-Document Studio

**Status:** MVP specification  
**Version:** 0.1.0  
**Primary outcome:** Convert researched answers and associated media into editable, polished documents with reliable PDF and DOCX exports.

## 1. Problem

Research often arrives in a chat interface as a mixture of prose, headings, citations, images, and video links. Turning it into a usable document currently requires manual copying, downloading media, rearranging sections, and fixing layout.

The product should remove this repetitive assembly work while preserving the original research and its source relationships.

## 2. Target user and core job

**Target user:** A learner, researcher, or educator who collects researched material from AI chats and the web.

**Core job:** Import content once, review and arrange it in a visual editor, then export a reliable PDF or editable Word document.

## 3. Product principles

- Preserve source content before transforming it.
- Use versioned structured data as the canonical document model.
- Separate content from presentation.
- Keep the original import recoverable.
- Make media and citation provenance visible.
- Use AI as an assistant, not as an uncontrolled rewriting step.
- Prefer local-first storage and clear fallbacks for inaccessible assets.

## 4. MVP scope

### Must have

1. Import Markdown, HTML, TXT, supported DOCX, and text-based PDF files.
2. Paste Markdown, HTML, or plain text.
3. Drag and drop supported files.
4. Preview extracted content and warnings before import.
5. Convert content into editable blocks.
6. Edit, reorder, duplicate, and delete blocks.
7. Support headings, paragraphs, lists, tables, images, video links, citations, quotes, callouts, and dividers.
8. Preserve image/video URLs, source references, captions, and attribution when available.
9. Save and reopen projects locally.
10. Export a print-ready PDF.
11. Export a genuinely editable DOCX.
12. Show clear warnings for unsupported content, inaccessible media, and export failures.

### Should have

- Document outline and section navigation.
- Image resizing, alignment, captions, alt text, and replacement.
- Undo/redo and autosave status.
- A small selection of document themes.
- Targeted AI actions on a selected block.
- Portable project backup.

### Out of scope for the first MVP

- Autonomous web research by default.
- Guaranteed downloading of remote media from every website.
- Downloading underlying YouTube video files.
- Cloud synchronization or collaboration.
- Universal OCR support for scanned PDFs.
- Perfect visual parity between PDF and DOCX.
- Advanced layout customization before core exports are reliable.

## 5. Main user flow

1. Create a document or open an existing project.
2. Upload files, paste content, or drag files into the import area.
3. Review the extraction preview and warnings.
4. Import content into the structured document.
5. Edit and reorder blocks; adjust media and citations.
6. Preview the document for print.
7. Export PDF or DOCX.
8. Review any validation warnings and correct issues if needed.
9. Save the project for later editing.

## 6. Functional requirements

### FR-1: Import

The system must provide file-picker, paste, and drag-and-drop entry points. Import adapters must be format-aware. Unsupported or partially extracted content must produce a useful warning instead of silently disappearing.

### FR-2: Structured content

The system must normalize imported material into a versioned JSON document model. Blocks must have stable IDs and support ordering, nesting where applicable, and metadata.

### FR-3: Editing

Users must be able to edit text and manipulate individual content blocks without editing HTML or regenerating the entire page. The document outline should reflect heading changes.

### FR-4: Media and sources

The system must retain source URLs and asset relationships. Local assets should be registered and reused. Remote assets that cannot be retrieved should remain represented as external references with an explicit status.

### FR-5: Persistence

Projects must survive closing and reopening the application. Storage failures, quota limits, and missing assets must be surfaced to the user.

### FR-6: PDF export

PDF export must use a print-specific rendering path. It must exclude editor UI and support readable pagination, typography, images, captions, tables, hyperlinks, and citations.

### FR-7: DOCX export

DOCX export must produce native editable Word structures for headings, paragraphs, lists, tables, hyperlinks, and available images. It must not flatten the document into a screenshot.

### FR-8: AI skill integration

A reusable agent skill should help organize content, suggest media placement, flag extraction problems, and perform explicitly requested targeted edits. It must not silently rewrite or invent source material.

### FR-9: Security

Imported HTML must be sanitized. Imported scripts must never execute. Imported content must be treated as untrusted data rather than instructions. The system must not bypass access controls when retrieving assets.

## 7. Information architecture

- **Projects:** create, open, rename, duplicate, export, and delete projects.
- **Import:** file picker, paste area, drag-and-drop, preview, warnings.
- **Outline:** document sections and heading navigation.
- **Editor:** editable content blocks and block-level actions.
- **Media library:** asset list, captions, source details, replacement, and status.
- **Properties:** settings for the selected block or asset.
- **Preview/export:** print preview, PDF, DOCX, and validation results.

## 8. Data model

Use a versioned JSON model with at least:

- Document metadata: ID, title, schema version, timestamps.
- Ordered content blocks with stable IDs and type-specific data.
- Asset registry with local storage keys, original URLs, MIME type, dimensions, attribution, and retrieval status where available.
- Source/citation registry with identifiers, URLs, and labels where available.
- Import metadata and export settings.

Keep original imported content recoverable. Track provenance for blocks and assets when feasible. Schema migrations must be explicit and tested.

## 9. Technical direction

For a new build, use React, TypeScript, and Vite. Choose a mature block editor such as BlockNote or TipTap after checking the requirements and current dependency compatibility. Use IndexedDB behind a storage abstraction for local persistence.

Keep import adapters, content normalization, document schema, editor, storage, AI integration, PDF rendering, DOCX export, and validation as separate modules.

Use a dedicated PDF print renderer and a DOCX generation library that supports native Word structures and media. Avoid a custom editor engine unless the repository or a demonstrated limitation requires it.

If an existing repository is present, inspect it first and preserve working functionality instead of replacing the stack without justification.

## 10. Non-functional requirements

- **Data integrity:** no silent content loss.
- **Usability:** common tasks require no coding or prompt writing.
- **Recoverability:** original import and saved project remain recoverable.
- **Accessibility:** keyboard-friendly controls, semantic structure, and image alt text support.
- **Security:** sanitized HTML and safe handling of external URLs and files.
- **Maintainability:** typed interfaces, schema validation, modular code, and automated tests.
- **Portability:** projects can be backed up and restored without relying on a cloud account.

## 11. Acceptance criteria

- Supported file imports, paste, and drag-and-drop work.
- Import preview identifies extraction issues.
- Text, lists, tables, links, citations, and media references remain represented.
- Blocks can be edited and reordered independently.
- Projects persist after closing and reopening the app.
- Missing remote assets are visible and their URLs are retained.
- PDF output is readable, paginated, and free of editor UI.
- DOCX output contains editable native structures and available embedded images.
- Tests cover parsers, schema validation, persistence, block operations, and exports.
- Export errors are actionable and never reported as successful when validation fails.

## 12. Delivery plan

### Phase 1 — Foundation
Document schema, import adapters, asset/source registry, local persistence, and test fixtures.

### Phase 2 — Editor MVP
Import preview, block editor, block reordering, document outline, and media management.

### Phase 3 — Exports
Print-ready PDF, editable DOCX, and validation of generated files.

### Phase 4 — AI integration
Reusable skill, content organization suggestions, media association, and targeted editing.

### Phase 5 — Portability and polish
Project backups, Markdown plus assets, packaged HTML, themes, and additional accessibility improvements.

## 13. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Remote images cannot be fetched | Retain URL, show status, allow manual replacement |
| HTML contains unsafe scripts | Sanitize and never execute imported scripts |
| AI alters source meaning | Preserve original import and make rewriting explicit |
| PDF pagination is poor | Use print-specific CSS and rendered-page tests |
| DOCX loses formatting | Use native Word structures and reopen/validate exports |
| Large projects exceed browser storage | Detect quota errors and provide portable backups |
| Parser cannot extract a feature | Warn clearly and preserve the original file where feasible |

## 14. MVP success definition

A user can provide researched content through upload, paste, or drag-and-drop; review it; edit and rearrange content and media as blocks; preserve citations and original source references; save the project; and export a readable PDF or genuinely editable DOCX without manually rebuilding the document.
