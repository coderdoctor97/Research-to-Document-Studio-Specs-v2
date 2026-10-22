# Redesign pass

Applied with the `redesign-existing-projects` skill (`AGENTS.md`). Scope: interface only —
no framework migration, no dependency changes, no logic rewrites except one defect fix noted
at the end.

Screenshots of each surface, before and after, are in [`docs/before-after/`](before-after).

## What the audit found

| Area | Finding |
| --- | --- |
| Type | Inter everywhere — the most common default. Body at 14px with only 500/600/700 weights in use, so there was no weight below "medium" to build hierarchy from. |
| Colour | Block palette used **ten hues**: clay, ink, sage, `#8b7355`, `#b08d57`, `#7c6b8a` (purple), `#9b6a3d`, warning amber, `#7a857c`, plus the line colour. The dashboard also mixed a clay wash with a sage wash, tinting the paper warm on one side and cool on the other. |
| States | **Zero `:active` rules in 2,972 lines.** Buttons moved on hover and then had no pressed feedback. Transitions were 100–140ms. |
| Layout | `height: 100vh` in four places (mobile viewport bug). Hero was a 2-column split with a centred, bordered card. Empty library and empty document were dashed placeholder rectangles. |
| Detail | No favicon, no `og:` tags. `border-radius` used 16 distinct values. `z-index` mixed local numbers (20, 60, 100, 150, 200, 300) with no scale. |
| Print | Preview rendered the document title twice when the first block was already the same H1, and disagreed with the PDF/DOCX exporters, which treat the title as metadata. |

## What changed

**Type.** Self-hosted **Geist** (UI), **Source Serif 4** (display, editor title, document
headings) and **Geist Mono** (labels, counters, metadata). Eight `woff2` faces, 412 KB total,
served from `public/fonts` — no network fetch, so the app renders identically offline and
inside a sandboxed preview iframe that blocks third-party requests. Added weight 300–700 to
the variable axis, so hierarchy comes from 400/500/550/560 rather than a bold-vs-regular jump.
Eyebrows moved to mono with wider tracking; data readouts use `font-variant-numeric: tabular-nums`.

**Colour.** One accent (clay) on one warm gray family. The ten-hue palette is now one accent
plus neutral ink at descending weight — each block type is distinguished by **shape** (list
rules, table grid, image diagonal, callout bar), not by a new colour. The purple is gone. The
dashboard's two competing radial washes became a single light source from the top left.
Sage and amber survive only as semantic state colours (saved, warning), never as decoration.

**Surfaces.** Dashed placeholder boxes replaced with composed states: the empty library gets a
margin rule and a real icon, the empty document an editorial rule instead of a frame. Cards
lost the border + shadow + white combination; hierarchy is background and hairline only, with
an accent rule that scales in on hover. Modals and the hero card use an inset white hairline to
simulate edge refraction. A fixed, pointer-events-off grain overlay breaks the flatness of the
large paper fields. Shadows are tinted to the paper and assume one light source.

**Motion and states.** Every interactive control now has hover, `:active` and `:focus-visible`.
Pressed controls translate 1px and scale to 0.988. One easing curve and a three-step duration
scale (`--dur-fast` / `--dur` / `--dur-slow`) replace the ad-hoc 100–140ms values. All values
respect `prefers-reduced-motion` for the skeleton sheen.

**Layout.** `100vh` → `100dvh` everywhere. `--radius-micro|sm|md|lg|xl` replaces 16 loose radius
values. A `--z-base|sticky|overlay|modal|toast|grain` scale replaces the ad-hoc numbers. Project
grid is `auto-fill` with a fixed-ish minimum so cards stop being three equal columns; the newest
document leads by type size. Mobile hero actions stack full-width instead of squeezing onto a
ragged line.

**Accessibility and metadata.** Branded favicon and `og:image`, both inline SVG. `theme-color`,
`og:title/description/type`, `twitter:card`, a real page title. Skip link to the editor canvas.
Focus rings on every control; inputs use a soft accent ring instead of a 2px outline.

## The one behaviour change

`src/ui/PrintPreview.tsx` no longer prints a masthead when the first block is a level-1 heading
carrying the same text as the document title. Before, such a document showed its title twice in
preview while the PDF and DOCX exports showed it once — the preview was lying about the output.
A five-line `repeatsDocumentTitle()` guard fixes it and is the only logic touched.

## Verification

- `tsc -b --noEmit` clean.
- `vite build` succeeds.
- 39 of 40 tests pass. `tests/import-docx-pdf.test.ts` fails identically on the **untouched
  clone** (verified by stashing all changes and re-running), so it is a pre-existing failure in
  the PDF import path, not a regression from this pass.
- Checked at 1440px and 390px: no horizontal overflow, no console errors, fonts loaded and
  applied, focus ring present on keyboard traversal.

## Deliberately not done

- No code-splitting of the 3.3 MB bundle, no dependency swaps, no `manualChunks` tuning — out of
  scope for a design pass, and the skill's own rules forbid migrations.
- The `modern` export theme still targets sans-serif output; only its font stack was pointed at
  Geist, since Inter is no longer shipped.
