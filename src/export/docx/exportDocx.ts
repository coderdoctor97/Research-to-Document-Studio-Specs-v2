import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
  type ILevelsOptions,
  type ParagraphChild,
} from 'docx'
import type {
  Block,
  CitationBlock,
  Document as StudioDocument,
  ImageBlock,
  ListBlock,
  QuoteBlock,
  Source,
  TableBlock,
} from '../../model/schema'
import { isSafeLinkHref, parseInlineRuns, type InlineRun } from '../../model/inline'
import { getTheme, pageSizePoints, type ThemeDefinition } from '../theme'
import type { ExportResult, ExportValidation } from '../types'
import { slugifyFileName } from '../types'
import type { ExportWarning, ResolvedImage } from '../images'
import { isImageTypeSupportedByDocx } from '../images'
import { unsafeLinkWarnings } from '../common'
import { validateDocxBlob } from './validateDocx'

const HEX = (color: string) => color.replace('#', '').toUpperCase()

function headingLevel(level: number) {
  switch (Math.min(6, Math.max(1, level))) {
    case 1:
      return HeadingLevel.HEADING_1
    case 2:
      return HeadingLevel.HEADING_2
    case 3:
      return HeadingLevel.HEADING_3
    case 4:
      return HeadingLevel.HEADING_4
    case 5:
      return HeadingLevel.HEADING_5
    default:
      return HeadingLevel.HEADING_6
  }
}

function docxRun(run: InlineRun, theme: ThemeDefinition, linked: boolean): TextRun {
  return new TextRun({
    text: run.text,
    bold: run.bold,
    italics: run.italic,
    font: run.code ? 'Courier New' : theme.docxFontFamily,
    size: run.code ? Math.round((theme.bodyPt - 0.5) * 2) : undefined,
    color: run.code ? '7A2E2E' : linked ? HEX(theme.accentColor) : undefined,
    underline: linked ? { type: UnderlineType.SINGLE, color: HEX(theme.accentColor) } : undefined,
  })
}

function inlineChildren(html: string, theme: ThemeDefinition): ParagraphChild[] {
  const children: ParagraphChild[] = []
  for (const run of parseInlineRuns(html)) {
    const lines = run.text.split('\n')
    lines.forEach((line, index) => {
      if (index > 0) children.push(new TextRun({ break: 1 }))
      if (!line) return
      const piece = { ...run, text: line }
      if (piece.href && isSafeLinkHref(piece.href)) {
        children.push(
          new ExternalHyperlink({
            link: piece.href,
            children: [docxRun(piece, theme, true)],
          }),
        )
      } else {
        children.push(docxRun(piece, theme, false))
      }
    })
  }
  return children
}

function paragraph(
  children: ParagraphChild[],
  options: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
    spacingBefore?: number
    spacingAfter?: number
    keepNext?: boolean
    indentLeft?: number
    borderBottom?: boolean
    color?: string
  } = {},
): Paragraph {
  return new Paragraph({
    children,
    alignment: options.alignment,
    keepNext: options.keepNext,
    indent: options.indentLeft ? { left: options.indentLeft } : undefined,
    spacing: {
      before: options.spacingBefore,
      after: options.spacingAfter,
    },
    border: options.borderBottom
      ? {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 6,
            color: 'CCCCCC',
            space: 4,
          },
        }
      : undefined,
  })
}

function textParagraph(
  text: string,
  theme: ThemeDefinition,
  options: { italic?: boolean; color?: string; size?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
): Paragraph {
  return new Paragraph({
    alignment: options.alignment,
    children: [
      new TextRun({
        text,
        italics: options.italic,
        color: options.color ? HEX(options.color) : undefined,
        size: options.size ? Math.round(options.size * 2) : undefined,
        font: theme.docxFontFamily,
      }),
    ],
  })
}

function listItemParagraphs(block: ListBlock, theme: ThemeDefinition): Paragraph[] {
  const definition = {
    reference: `list_${block.id.replace(/[^a-zA-Z0-9]/g, '')}`,
    levels: Array.from({ length: 7 }, (_, level): ILevelsOptions => ({
      level,
      format: LevelFormat.DECIMAL,
      text: `%${level + 1}.`,
      alignment: AlignmentType.START,
      style: {
        paragraph: {
          indent: { left: 360 * (level + 1), hanging: 360 },
        },
      },
    })),
  }

  return block.items.map(
    (item) =>
      new Paragraph({
        children: inlineChildren(item.html, theme),
        bullet: block.ordered ? undefined : { level: Math.min(6, item.depth) },
        numbering: block.ordered
          ? { reference: definition, level: Math.min(6, item.depth) }
          : undefined,
        spacing: { after: 60 },
      }),
  )
}

function tableBlock(block: TableBlock, theme: ThemeDefinition): (Table | Paragraph)[] {
  const border = { style: BorderStyle.SINGLE, size: 4, color: HEX(theme.borderColor) }
  const rows = block.rows.map(
    (row, rowIndex) =>
      new TableRow({
        tableHeader: block.header && rowIndex === 0,
        cantSplit: true,
        children: row.map(
          (cell) =>
            new TableCell({
              shading:
                block.header && rowIndex === 0 ? { fill: HEX(theme.accentSoft) } : undefined,
              borders: { top: border, bottom: border, left: border, right: border },
              children: [
                new Paragraph({
                  children: inlineChildren(cell, theme),
                  spacing: { after: 0 },
                }),
              ],
            }),
        ),
      }),
  )

  const output: (Table | Paragraph)[] = [
    new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    }),
  ]
  if (block.caption) {
    output.push(
      textParagraph(block.caption, theme, { italic: true, color: theme.mutedColor, size: theme.bodyPt - 1.5 }),
    )
  }
  output.push(new Paragraph({ spacing: { after: 120 } }))
  return output
}

function imageParagraphs(
  block: ImageBlock,
  resolved: ResolvedImage | undefined,
  theme: ThemeDefinition,
  pageSize: StudioDocument['exportSettings']['pageSize'],
  warnings: ExportWarning[],
): Paragraph[] {
  const alignment =
    block.align === 'left'
      ? AlignmentType.LEFT
      : block.align === 'right'
        ? AlignmentType.RIGHT
        : AlignmentType.CENTER
  const contentWidthPx =
    ((pageSizePoints(pageSize).width - theme.marginPt * 2) / 72) * 96
  const widthPx = Math.max(40, (contentWidthPx * block.widthPercent) / 100)
  const ratio = resolved?.width && resolved?.height ? resolved.height / resolved.width : 0.66

  const paragraphs: Paragraph[] = []
  if (resolved && isImageTypeSupportedByDocx(resolved.imageType)) {
    const type = resolved.imageType as 'png' | 'jpg' | 'gif' | 'bmp'
    paragraphs.push(
      new Paragraph({
        alignment,
        spacing: { before: 120, after: 60 },
        children: [
          new ImageRun({
            type,
            data: resolved.bytes,
            transformation: { width: widthPx, height: widthPx * ratio },
            altText: {
              name: block.alt || block.caption || 'Document image',
              description: block.alt || block.caption || 'Image imported into the document',
            },
          }),
        ],
      }),
    )
  } else {
    if (resolved) {
      warnings.push({
        code: 'docx-image-format',
        message: `${resolved.imageType.toUpperCase()} images are not supported by DOCX export; a text placeholder was written instead.`,
        blockId: block.id,
      })
    }
    paragraphs.push(
      textParagraph(
        `[Image unavailable${block.alt ? `: ${block.alt}` : ''}${block.url ? ` — ${block.url}` : ''}]`,
        theme,
        { italic: true, color: theme.mutedColor, alignment },
      ),
    )
  }
  if (block.caption) {
    paragraphs.push(
      textParagraph(block.caption, theme, { italic: true, color: theme.mutedColor, size: theme.bodyPt - 1.5, alignment }),
    )
  }
  if (block.attribution) {
    paragraphs.push(
      textParagraph(block.attribution, theme, { color: theme.mutedColor, size: theme.bodyPt - 2, alignment }),
    )
  }
  return paragraphs
}

function safeLinkParagraph(url: string, label: string, theme: ThemeDefinition): Paragraph {
  const children: ParagraphChild[] = isSafeLinkHref(url)
    ? [
        new ExternalHyperlink({
          link: url,
          children: [
            new TextRun({
              text: label,
              color: HEX(theme.accentColor),
              underline: { type: UnderlineType.SINGLE, color: HEX(theme.accentColor) },
              font: theme.docxFontFamily,
              size: Math.round((theme.bodyPt - 1) * 2),
            }),
          ],
        }),
      ]
    : [new TextRun({ text: label, color: HEX(theme.mutedColor), font: theme.docxFontFamily })]

  return new Paragraph({ children, spacing: { after: 80 } })
}

function citationParagraphs(block: CitationBlock, theme: ThemeDefinition): Paragraph[] {
  const output = [
    new Paragraph({
      children: [
        new TextRun({
          text: block.label || 'Source',
          bold: true,
          font: theme.docxFontFamily,
        }),
      ],
      spacing: { before: 120, after: 40 },
    }),
  ]
  if (block.quote) {
    output.push(
      new Paragraph({
        children: [new TextRun({ text: block.quote, italics: true, font: theme.docxFontFamily })],
        indent: { left: 240 },
      }),
    )
  }
  if (block.note) {
    output.push(
      new Paragraph({
        children: [new TextRun({ text: block.note, color: HEX(theme.mutedColor), font: theme.docxFontFamily })],
      }),
    )
  }
  if (block.url) {
    output.push(safeLinkParagraph(block.url, block.url, theme))
  }
  return output
}

function quoteParagraphs(block: QuoteBlock, theme: ThemeDefinition): Paragraph[] {
  const border = { style: BorderStyle.SINGLE, size: 12, color: HEX(theme.borderColor), space: 12 }
  const output = [
    new Paragraph({
      children: inlineChildren(block.html, theme),
      border: { left: border },
      indent: { left: 260 },
      spacing: { before: 120, after: 60 },
    }),
  ]
  if (block.attribution) {
    output.push(textParagraph(`— ${block.attribution}`, theme, { color: theme.mutedColor, size: theme.bodyPt - 1 }))
  }
  if (block.url) {
    output.push(safeLinkParagraph(block.url, block.url, theme))
  }
  return output
}

function calloutTable(
  block: Extract<Block, { type: 'callout' }>,
  theme: ThemeDefinition,
): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: HEX(theme.borderColor) }
  const children: Paragraph[] = []
  if (block.title) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: block.title, bold: true, color: HEX(theme.headingColor), font: theme.docxFontFamily }),
        ],
        spacing: { after: 60 },
      }),
    )
  }
  children.push(new Paragraph({ children: inlineChildren(block.html, theme), spacing: { after: 0 } }))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: HEX(theme.accentSoft) },
            borders: { top: border, bottom: border, left: border, right: border },
            children,
          }),
        ],
      }),
    ],
  })
}

function blockToDocx(
  block: Block,
  document: StudioDocument,
  images: Map<string, ResolvedImage>,
  theme: ThemeDefinition,
  warnings: ExportWarning[],
): (Paragraph | Table)[] {
  switch (block.type) {
    case 'heading':
      return [
        new Paragraph({
          heading: headingLevel(block.level),
          children: inlineChildren(block.html, theme),
          keepNext: true,
        }),
      ]
    case 'paragraph':
      return [
        new Paragraph({
          children: inlineChildren(block.html, theme),
          spacing: { after: 120 },
        }),
      ]
    case 'list':
      return listItemParagraphs(block, theme)
    case 'table':
      return tableBlock(block, theme)
    case 'image':
      return imageParagraphs(block, images.get(block.id), theme, document.exportSettings.pageSize, warnings)
    case 'video': {
      const output = [
        textParagraph('VIDEO', theme, { color: theme.mutedColor, size: 7.5 }),
        safeLinkParagraph(block.url, block.title || block.url, theme),
      ]
      if (block.caption) output.push(textParagraph(block.caption, theme, { color: theme.mutedColor }))
      return output
    }
    case 'citation':
      return citationParagraphs(block, theme)
    case 'callout':
      return [calloutTable(block, theme), new Paragraph({ spacing: { after: 120 } })]
    case 'quote':
      return quoteParagraphs(block, theme)
    case 'divider':
      return [paragraph([], { borderBottom: true })]
    default:
      return []
  }
}

function sourceParagraphs(sources: Source[], theme: ThemeDefinition): (Paragraph | Table)[] {
  if (sources.length === 0) return []
  const output: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({ text: 'Sources', bold: true, color: HEX(theme.headingColor), font: theme.docxFontFamily }),
      ],
      spacing: { before: 360, after: 120 },
    }),
  ]
  sources.forEach((source, index) => {
    output.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${index + 1}. ${source.label || source.url || 'Source'}`, font: theme.docxFontFamily }),
          ...(source.url
            ? [
                new TextRun({ text: ' — ', font: theme.docxFontFamily }),
                ...(isSafeLinkHref(source.url)
                  ? [
                      new ExternalHyperlink({
                        link: source.url,
                        children: [
                          new TextRun({
                            text: source.url,
                            color: HEX(theme.accentColor),
                            underline: { type: UnderlineType.SINGLE, color: HEX(theme.accentColor) },
                            font: theme.docxFontFamily,
                          }),
                        ],
                      }),
                    ]
                  : [new TextRun({ text: source.url, font: theme.docxFontFamily })]),
              ]
            : []),
        ],
        spacing: { after: 60 },
      }),
    )
  })
  return output
}

export async function exportDocx(
  document: StudioDocument,
  images: Map<string, ResolvedImage>,
  imageWarnings: ExportWarning[] = [],
): Promise<ExportResult> {
  const theme = getTheme(document.exportSettings.theme)
  const warnings = [...unsafeLinkWarnings(document), ...imageWarnings]
  const page = pageSizePoints(document.exportSettings.pageSize)
  const margin = Math.round((theme.marginPt / 72) * 1440)

  const body: (Paragraph | Table)[] = []
  for (const block of document.blocks) {
    body.push(...blockToDocx(block, document, images, theme, warnings))
  }
  if (document.exportSettings.includeSourceList) {
    body.push(...sourceParagraphs(document.sources, theme))
  }

  const docx = new DocxDocument({
    title: document.title,
    creator: 'Research-to-Document Studio',
    description: 'Document exported from Research-to-Document Studio',
    styles: {
      default: {
        document: {
          run: {
            font: theme.docxFontFamily,
            size: Math.round(theme.bodyPt * 2),
            color: HEX(theme.textColor),
          },
          paragraph: {
            spacing: {
              line: Math.round(theme.lineHeight * 240),
              after: 120,
            },
          },
        },
        heading1: {
          run: { font: theme.docxFontFamily, size: Math.round(theme.headingSizes[0] * 2), bold: true, color: HEX(theme.headingColor) },
          paragraph: { spacing: { before: 360, after: 120 }, keepNext: true },
        },
        heading2: {
          run: { font: theme.docxFontFamily, size: Math.round(theme.headingSizes[1] * 2), bold: true, color: HEX(theme.headingColor) },
          paragraph: { spacing: { before: 280, after: 100 }, keepNext: true },
        },
        heading3: {
          run: { font: theme.docxFontFamily, size: Math.round(theme.headingSizes[2] * 2), bold: true, color: HEX(theme.headingColor) },
          paragraph: { spacing: { before: 240, after: 80 }, keepNext: true },
        },
        heading4: {
          run: { font: theme.docxFontFamily, size: Math.round(theme.headingSizes[3] * 2), bold: true, color: HEX(theme.headingColor) },
          paragraph: { spacing: { before: 200, after: 80 }, keepNext: true },
        },
        heading5: {
          run: { font: theme.docxFontFamily, size: Math.round(theme.headingSizes[4] * 2), bold: true, color: HEX(theme.headingColor) },
          paragraph: { spacing: { before: 160, after: 60 }, keepNext: true },
        },
        heading6: {
          run: { font: theme.docxFontFamily, size: Math.round(theme.headingSizes[5] * 2), bold: true, color: HEX(theme.headingColor) },
          paragraph: { spacing: { before: 160, after: 60 }, keepNext: true },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(page.width * 20), height: Math.round(page.height * 20) },
            margin: { top: margin, right: margin, bottom: margin, left: margin },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${document.title} · Page `,
                    size: 16,
                    color: HEX(theme.mutedColor),
                    font: theme.docxFontFamily,
                  }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: HEX(theme.mutedColor) }),
                  new TextRun({ text: ' of ', size: 16, color: HEX(theme.mutedColor) }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: HEX(theme.mutedColor) }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  })

  let blob: Blob
  try {
    blob = await Packer.toBlob(docx)
  } catch (error) {
    throw new Error(
      `DOCX export failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const validation: ExportValidation = await validateDocxBlob(blob, document, images)
  if (imageWarnings.length > 0) {
    validation.warnings.push(
      `${new Set(imageWarnings.map((warning) => warning.message)).size} image warning(s); unavailable images appear as text placeholders.`,
    )
  }

  return {
    blob,
    fileName: slugifyFileName(document.title, 'docx'),
    validation,
  }
}
