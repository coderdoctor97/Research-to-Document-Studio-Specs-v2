# Research-to-Document Studio

Local-first document studio for turning research material into an editable report and exporting a print-ready PDF or an editable DOCX.

Import Markdown, HTML, TXT, DOCX, or a text-based PDF; review the extraction before committing it; edit the result as typed blocks; then export. Projects, images, and the untouched original imports stay in the browser's IndexedDB. There is no server, account, or telemetry.

**Status:** MVP, schema version 1.

## What works

- **Import:** file picker, paste (Markdown, HTML, plain text), and drag-and-drop.
- **Preview before import:** block sample, word/block/image/link counts, extraction warnings, editable document title.
- **Formats:** `.md`, `.markdown`, `.html`, `.htm`, `.txt`, `.docx`, `.pdf` (text-based, up to 25 MB).
- **Blocks:** heading, paragraph, list, table, image, video link, citation, callout, quote, divider.
- **Editing:** inline bold/italic/code/links, per-type fields, reorder up/down, duplicate, delete, insert from palette.
- **Outline:** live heading navigation.
- **Media registry:** local image storage, remote URLs and status, alt text, captions, attribution, alignment, width, replacement, insertion.
- **Sources:** imported links are registered; blocks can reference sources; citations can link to a registered source; source list can be appended to exports.
- **Undo/redo and autosave:** session history, debounced IndexedDB saves, visible save state, manual save, save-error messages.
- **Themes:** Classic, Modern, Compact; A4 or Letter.
- **PDF export:** dedicated renderer without editor UI, page numbers, links, tables, images, citations, source list, byte-level validation before download.
- **DOCX export:** native Word headings, paragraphs, lists, tables, hyperlinks, and embedded images, validated as a ZIP package before download.
- **Print preview:** browser print path with print-only CSS.
- **AI assistance:** copyable prompts plus a reusable skill. No API calls and no automatic rewriting.

## Quick start

Requirements: Node.js 20.19+ or 22.12+ and a current browser with IndexedDB.

### Windows (double-click)

1. Double-click `setup.bat` once. It checks Node.js, installs dependencies, and keeps the window open if something fails.
2. Double-click `start.bat`. It starts the local server and opens the app in your browser. Keep the window open; press `Ctrl+C` to stop.

If `node_modules` is missing, `start.bat` runs the setup step automatically.

### Terminal

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Production build:

```bash
npm run build
npm run preview
```

## Verification

Current build:

- `npm test` — 40 tests across 9 files covering schema, inline sanitizing, HTML/Markdown/TXT/DOCX/PDF import, import commit and provenance remapping, block operations, IndexedDB persistence, and both exports.
- `npx tsc --noEmit` — clean.
- `npm run build` — succeeds. Vite warns about large chunks because PDF.js and the PDF renderer are heavy; this is expected.
- Browser checks with Playwright/Chromium — dashboard, editing, block creation, autosave, reload persistence, PDF and DOCX export, print preview, paste import, source/media registries, and re-import of the exported PDF, exported DOCX, and an HTML file with an embedded data-URL image. Console and page errors: none.

The export tests validate structure, not visual fidelity in every PDF reader or Word version. Open critical files in the target application before delivery.

## How the import flow works

1. A file is read locally. HTML is parsed with `DOMParser` (inert) and walked into blocks. Markdown is converted with `marked`, then normalized through the same HTML walker. DOCX uses Mammoth. PDF uses PDF.js text extraction and link annotations.
2. A preview is built without saving anything. Unsupported or lossy content produces a warning instead of disappearing silently.
3. On commit, image blobs and the original file/paste are written first, then the document is saved. If the document is appended to an existing project, source URLs are deduplicated and block/citation references are remapped to the surviving source IDs.
4. The original import can be downloaded later from the Document inspector.

### Import limitations

| Source | What is preserved | What is not |
|---|---|---|
| Markdown | Headings, paragraphs, lists, tables, code (as formatted paragraph), quotes, links, images | Raw HTML beyond the inline subset, footnotes, front matter |
| HTML | Supported block structure, inline formatting, links, images, tables, video links | Scripts, styles, forms, iframes as live content, complex CSS layout |
| TXT | Paragraphs and line breaks | Any structure that was not in the text |
| DOCX | Headings, paragraphs, lists, tables, inline emphasis, embedded images | Fonts, colors, columns, headers/footers, floating objects, comments, tracked changes |
| PDF | Text lines, inferred headings and paragraphs, link annotations, metadata title | Images, vector graphics, scanned pages (no OCR), exact columns and layout |

PDF headings are inferred from font size. Multi-column PDFs may be merged in the wrong reading order. The preview warns about both.

## Data model and storage

The canonical document is versioned JSON validated by Zod:

```
Document
├── id, schemaVersion, title, timestamps
├── blocks[]        ordered, stable IDs, sourceRefs[], metadata{}
├── assets[]        registry entries with storageKey, URL, MIME type, status
├── sources[]       URL, label, kind, accessed date
├── imports[]       format, file name, warnings, original blob key
└── exportSettings  theme, page size, include source list
```

IndexedDB database `research-to-document-studio` (version 1) has three stores:

- `projects` — document JSON and summary fields.
- `assets` — image bytes stored as `ArrayBuffer`, with MIME type.
- `imports` — untouched original bytes as `ArrayBuffer`, with file name.

Images and originals are stored as buffers rather than `Blob` objects so they survive structured cloning consistently, including in test environments. The UI converts them back to blobs when needed.

## Export behavior

**PDF** uses `@react-pdf/renderer`, then `pdf-lib` reads the generated bytes to verify the header, page count, and page sizes. PNG and JPEG images are embedded. Other formats are rendered as placeholders with a warning. Built-in fonts cover Latin text; a character outside that range can fail the export with an explicit font hint.

**DOCX** uses the `docx` library to build native Word structures, then JSZip validates the package: `word/document.xml`, content types, heading styles, list numbering, table count, embedded drawings, hyperlink relationships, and text samples from the document. PNG, JPEG, GIF, and BMP images are embedded. Unsupported formats become placeholders with a warning.

Remote images are fetched only when an export is generated. Requests use `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`, with a 10-second timeout and a 20 MB limit. A failed request keeps the URL, renders a placeholder, and reports a warning. The application never bypasses authentication or access controls.

**Downloads happen only when validation passes.** A failed validation stays in the export dialog with its errors; it is never reported as a successful export.

## Security model

- Imported scripts are never executed. `script`, `style`, `noscript`, `template`, `svg`, `canvas`, and similar elements are skipped.
- Inline HTML is restricted to `a`, `strong`, `b`, `em`, `i`, `code`, `br`, `sup`, `sub` and sanitized with DOMPurify. Links must use `http:`, `https:`, or `mailto:`.
- Editable surfaces sanitize on throttled input and on blur. Read-only rendering uses a parser that emits runs, never raw HTML.
- Embedded frames are converted to links; video is represented as a link, never embedded media.
- The original import is treated as untrusted data. The AI prompts tell the assistant not to follow instructions found inside source material and never to invent facts.
- No content is sent to a server by the application itself.

## Design decisions

**Custom block editor instead of TipTap or BlockNote.** The app already needs its own canonical JSON model for imports, provenance, exports, and migrations. Adding a full rich-text editor would introduce a second document model and a conversion boundary where content can be lost. The custom editor keeps one source of truth and delegates only inline formatting to `contenteditable`, with sanitizing at the boundary. The tradeoff is a smaller feature set than a mature editor: no collaborative editing, nested block drag-and-drop, or advanced inline embeds.

**Imports are adapters, not the model.** Each importer produces the same `ImportPreview` shape. DOCX and PDF adapters hand off to the HTML walker or build blocks directly, so preview, warnings, provenance, and commit behavior stay consistent.

**Validation reads exported bytes.** Both exporters re-open their own output before offering a download. This catches package or page-structure failures that a successful library call alone would not prove.

**No automatic AI calls.** Prompts are copyable and explicit. The app cannot silently rewrite source text, and users can keep the original import for comparison.

## Project layout

```
src/
├── model/          schema, factories, inline sanitizing/parsing, migrations
├── import/         MD, HTML, TXT, DOCX, PDF adapters and shared helpers
├── studio/         import commit and source remapping
├── editor/         pure block/history operations
├── storage/        IndexedDB repository
├── export/         image resolution, themes, PDF and DOCX exporters, validators
├── ai/             copyable prompt builders
├── ui/             dashboard, editor, blocks, inspector, import/export dialogs, print view
└── styles.css      application, print, and responsive styles
tests/              schema, parsers, persistence, operations, exports
skills/             reusable research-document-organizer skill
```

## AI skill

`skills/research-document-organizer/SKILL.md` is a portable skill for an assistant that organizes research without fabricating or silently rewriting it. It covers intake, mapping, drafting, verification, and handoff, and returns Markdown that imports cleanly. The in-app AI tab builds prompts for structure review, drafting, and source intake; prompts include the current outline and source registry when available.

## Known limitations

- No OCR. Scanned PDFs produce a clear error.
- No cloud sync, accounts, or real-time collaboration.
- No portable project backup/restore or Markdown export yet. The dashboard can duplicate a project, but not package it for another device.
- No targeted per-block AI actions. The AI tab provides document-level copyable prompts.
- PDF import does not extract images or vector graphics. DOCX import may simplify complex layouts.
- PDF export supports Latin built-in fonts only and embeds only PNG/JPEG. Use DOCX for other image formats.
- Remote image export depends on the image host allowing browser requests (CORS). Failures are visible and leave a placeholder.
- Deleting a project does not garbage-collect asset or original-import records. Duplicated projects can share assets, so removing blobs immediately would break the copy. A future backup/cleanup flow should handle this.
- IndexedDB quota varies by browser. Quota and blocked-storage errors are surfaced, but there is no automatic pruning.
- Undo history is per open editor session and is not persisted.
- The app is not designed for editing the same project in two tabs at once; the last save wins.
- Automated export checks are structural. They do not prove identical pagination or styling in every reader.
- `npm audit` may report moderate advisories from the DOCX import dependency chain. Review them before a production deployment.

## Scripts

```bash
npm run dev        # Vite dev server
npm run build      # TypeScript build + production bundle
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit
npm test           # Vitest run
npm run test:watch # Vitest watch mode
```

## Design

The interface was rebuilt on a single-accent design system: self-hosted Geist, Source Serif 4 and
Geist Mono (no webfont CDN, so it renders identically offline), one clay accent on one warm gray
family, a token layer for radius / z-index / motion, and hover, pressed and focus states on every
control. See [`REDESIGN.md`](REDESIGN.md) for the audit that drove it and
[`docs/before-after/`](docs/before-after) for matched screenshots of each surface.

Fonts live in `public/fonts` (8 `woff2` faces, ~412 KB) and are licensed under the
SIL Open Font License. The UI itself has no runtime network dependency.
