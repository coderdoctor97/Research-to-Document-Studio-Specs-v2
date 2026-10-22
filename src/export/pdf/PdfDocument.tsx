import type { ReactElement } from 'react'
import { Document, Image, Link, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type {
  Block,
  CitationBlock,
  Document as StudioDocument,
  ImageBlock,
  ListBlock,
  Source,
  TableBlock,
  Theme,
} from '../../model/schema'
import { parseInlineRuns, isSafeLinkHref, type InlineRun } from '../../model/inline'
import {
  contentWidthPt,
  getTheme,
  type ThemeDefinition,
} from '../theme'
import type { ResolvedImage } from '../images'

export interface PdfDocumentProps {
  document: StudioDocument
  images: Map<string, ResolvedImage>
  theme: Theme
}

interface Styles {
  [key: string]: any
}

function makeStyles(theme: ThemeDefinition, pageSize: StudioDocument['exportSettings']['pageSize']) {
  const contentWidth = contentWidthPt(theme, pageSize)
  return StyleSheet.create({
    page: {
      paddingTop: theme.marginPt,
      paddingBottom: theme.marginPt + 18,
      paddingHorizontal: theme.marginPt,
      fontFamily: theme.pdfFontFamily,
      fontSize: theme.bodyPt,
      lineHeight: theme.lineHeight,
      color: theme.textColor,
      backgroundColor: '#ffffff',
    },
    footer: {
      position: 'absolute',
      bottom: 20,
      left: theme.marginPt,
      right: theme.marginPt,
      fontSize: 8,
      color: theme.mutedColor,
      textAlign: 'center',
      fontFamily: theme.pdfFontFamily,
    },
    heading: {
      color: theme.headingColor,
      fontFamily: theme.pdfFontFamily,
      fontWeight: 'bold',
      marginTop: 14,
      marginBottom: 6,
      lineHeight: 1.2,
    },
    paragraph: {
      marginBottom: 7,
    },
    bold: { fontFamily: theme.pdfFontFamily, fontWeight: 'bold' },
    italic: { fontFamily: theme.pdfFontFamily, fontStyle: 'italic' },
    boldItalic: { fontFamily: theme.pdfFontFamily, fontWeight: 'bold', fontStyle: 'italic' },
    code: {
      fontFamily: 'Courier',
      fontSize: theme.bodyPt - 0.5,
      color: '#7a2e2e',
    },
    link: { color: theme.accentColor, textDecoration: 'underline' },
    listItem: {
      flexDirection: 'row',
      marginBottom: 3,
      paddingLeft: 2,
    },
    listMarker: {
      width: 16,
      color: theme.mutedColor,
    },
    listBody: { flexGrow: 1, flexShrink: 1 },
    table: {
      marginTop: 4,
      marginBottom: 10,
      borderWidth: 0.75,
      borderColor: theme.borderColor,
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.75,
      borderBottomColor: theme.borderColor,
    },
    tableRowLast: { borderBottomWidth: 0 },
    tableHeader: { backgroundColor: theme.accentSoft },
    tableCell: {
      flexGrow: 1,
      flexBasis: 0,
      paddingVertical: 4,
      paddingHorizontal: 5,
      borderRightWidth: 0.75,
      borderRightColor: theme.borderColor,
    },
    tableCellLast: { borderRightWidth: 0 },
    tableText: { fontSize: theme.bodyPt - 0.5, lineHeight: 1.35 },
    tableTextHeader: { fontFamily: theme.pdfFontFamily, fontWeight: 'bold' },
    tableCaption: {
      fontSize: theme.bodyPt - 1.5,
      color: theme.mutedColor,
      fontStyle: 'italic',
      marginTop: -6,
      marginBottom: 10,
    },
    imageBlock: {
      marginVertical: 8,
      alignItems: 'center',
    },
    image: { borderRadius: 2 },
    imageCaption: {
      fontSize: theme.bodyPt - 1.5,
      color: theme.mutedColor,
      marginTop: 4,
      textAlign: 'center',
      maxWidth: contentWidth,
    },
    imageAttribution: {
      fontSize: theme.bodyPt - 2,
      color: theme.mutedColor,
      marginTop: 2,
      textAlign: 'center',
    },
    placeholder: {
      width: contentWidth,
      minHeight: 56,
      borderWidth: 0.75,
      borderStyle: 'dashed',
      borderColor: theme.borderColor,
      padding: 10,
      marginVertical: 8,
      backgroundColor: '#fafafa',
    },
    placeholderTitle: {
      fontSize: theme.bodyPt,
      color: theme.mutedColor,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    placeholderUrl: {
      fontSize: 8,
      color: theme.mutedColor,
    },
    callout: {
      borderLeftWidth: 3,
      borderLeftColor: theme.accentColor,
      backgroundColor: theme.accentSoft,
      paddingVertical: 7,
      paddingHorizontal: 9,
      marginBottom: 9,
    },
    calloutTitle: {
      fontFamily: theme.pdfFontFamily,
      fontWeight: 'bold',
      marginBottom: 3,
      color: theme.headingColor,
    },
    quote: {
      borderLeftWidth: 2,
      borderLeftColor: theme.borderColor,
      paddingLeft: 9,
      marginVertical: 8,
      color: theme.textColor,
    },
    quoteAttribution: {
      fontSize: theme.bodyPt - 1,
      color: theme.mutedColor,
      marginTop: 4,
    },
    citation: {
      borderWidth: 0.75,
      borderColor: theme.borderColor,
      padding: 8,
      marginVertical: 7,
      backgroundColor: '#fbfbfa',
    },
    citationLabel: {
      fontFamily: theme.pdfFontFamily,
      fontWeight: 'bold',
      fontSize: theme.bodyPt - 0.5,
      marginBottom: 3,
    },
    citationQuote: {
      fontStyle: 'italic',
      marginBottom: 3,
    },
    videoCard: {
      borderWidth: 0.75,
      borderColor: theme.borderColor,
      padding: 8,
      marginVertical: 7,
    },
    videoLabel: {
      fontSize: 7.5,
      letterSpacing: 1,
      color: theme.mutedColor,
      marginBottom: 3,
      textTransform: 'uppercase',
    },
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: theme.borderColor,
      marginVertical: 12,
      width: '100%',
      height: 1,
    },
    sourceList: {
      marginTop: 16,
      borderTopWidth: 0.75,
      borderTopColor: theme.borderColor,
      paddingTop: 10,
    },
    sourceHeading: {
      fontFamily: theme.pdfFontFamily,
      fontWeight: 'bold',
      fontSize: theme.headingSizes[2],
      color: theme.headingColor,
      marginBottom: 6,
    },
    sourceEntry: {
      fontSize: theme.bodyPt - 1,
      marginBottom: 4,
      color: theme.textColor,
    },
    sourceUrl: { color: theme.accentColor, textDecoration: 'underline' },
    systemNote: {
      fontSize: 8,
      color: theme.mutedColor,
      marginTop: 2,
    },
    contentWidth: { width: contentWidth },
    imageLeft: { alignItems: 'flex-start' },
    imageCenter: { alignItems: 'center' },
    imageRight: { alignItems: 'flex-end' },
    imageFull: { alignItems: 'center' },
    quoteText: { fontStyle: 'italic' },
    urlText: { fontSize: theme.bodyPt - 1.5, color: theme.mutedColor },
    strong: { fontWeight: 'bold' },
  }) as Styles
}

function runStyle(run: InlineRun, styles: Styles) {
  const style: any[] = []
  if (run.bold && run.italic) style.push(styles.boldItalic)
  else if (run.bold) style.push(styles.bold)
  else if (run.italic) style.push(styles.italic)
  if (run.code) style.push(styles.code)
  return style
}

function InlineContent({ html, styles }: { html: string; styles: Styles }) {
  const runs = parseInlineRuns(html)
  return (
    <>
      {runs.map((run, index) => {
        if (run.href) {
          return (
            <Link key={index} src={run.href} style={[styles.link, ...runStyle(run, styles)]}>
              {run.text}
            </Link>
          )
        }
        return (
          <Text key={index} style={runStyle(run, styles)}>
            {run.text}
          </Text>
        )
      })}
    </>
  )
}

function headingStyle(level: number, theme: ThemeDefinition, styles: Styles) {
  const clamped = Math.min(6, Math.max(1, level))
  return [styles.heading, { fontSize: theme.headingSizes[clamped - 1] }]
}

function renderList(
  block: ListBlock,
  styles: Styles,
): ReactElement {
  const counters: number[] = []
  let previousDepth = 0
  return (
    <View key={block.id} style={{ marginBottom: 8 }}>
      {block.items.map((item) => {
        if (item.depth < previousDepth) {
          for (let depth = item.depth + 1; depth < counters.length; depth += 1) counters[depth] = 0
        }
        previousDepth = item.depth
        let marker = '•'
        if (block.ordered) {
          counters[item.depth] = (counters[item.depth] ?? 0) + 1
          marker = `${counters[item.depth]}.`
        } else if (item.depth > 0) {
          marker = '◦'
        }
        return (
          <View key={item.id} style={[styles.listItem, { paddingLeft: item.depth * 14 }]}>
            <Text style={styles.listMarker}>{marker}</Text>
            <Text style={styles.listBody}>
              <InlineContent html={item.html} styles={styles} />
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function renderTable(block: TableBlock, styles: Styles): ReactElement {
  return (
    <View key={block.id}>
      <View style={styles.table}>
        {block.rows.map((row, rowIndex) => (
          <View
            key={`${block.id}-row-${rowIndex}`}
            wrap={false}
            style={[
              styles.tableRow,
              rowIndex === block.rows.length - 1 ? styles.tableRowLast : {},
              block.header && rowIndex === 0 ? styles.tableHeader : {},
            ]}
          >
            {row.map((cell, cellIndex) => (
              <View
                key={`${block.id}-cell-${rowIndex}-${cellIndex}`}
                style={[styles.tableCell, cellIndex === row.length - 1 ? styles.tableCellLast : {}]}
              >
                <Text
                  style={[styles.tableText, block.header && rowIndex === 0 ? styles.tableTextHeader : {}]}
                >
                  <InlineContent html={cell} styles={styles} />
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      {block.caption ? <Text style={styles.tableCaption}>{block.caption}</Text> : null}
    </View>
  )
}

function renderImage(
  block: ImageBlock,
  images: Map<string, ResolvedImage>,
  theme: ThemeDefinition,
  pageSize: StudioDocument['exportSettings']['pageSize'],
  styles: Styles,
): ReactElement {
  const resolved = images.get(block.id)
  const width = (contentWidthPt(theme, pageSize) * block.widthPercent) / 100
  const ratio =
    resolved?.width && resolved?.height ? resolved.height / resolved.width : 0.66
  const alignStyle =
    block.align === 'left'
      ? styles.imageLeft
      : block.align === 'right'
        ? styles.imageRight
        : block.align === 'full'
          ? styles.imageFull
          : styles.imageCenter

  return (
    <View key={block.id} style={[styles.imageBlock, alignStyle]} wrap={false}>
      {resolved && (resolved.imageType === 'png' || resolved.imageType === 'jpg') ? (
        <Image src={resolved.dataUrl} style={[styles.image, { width, height: width * ratio }]} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Image unavailable</Text>
          {block.alt ? <Text style={styles.placeholderUrl}>{block.alt}</Text> : null}
          {block.url ? <Text style={styles.placeholderUrl}>{block.url}</Text> : null}
          {resolved && resolved.imageType !== 'png' && resolved.imageType !== 'jpg' ? (
            <Text style={styles.placeholderUrl}>
              {resolved.imageType.toUpperCase()} images cannot be embedded in PDF export.
            </Text>
          ) : null}
        </View>
      )}
      {block.caption ? <Text style={styles.imageCaption}>{block.caption}</Text> : null}
      {block.attribution ? <Text style={styles.imageAttribution}>{block.attribution}</Text> : null}
    </View>
  )
}

function renderCitation(
  block: CitationBlock,
  document: StudioDocument,
  styles: Styles,
): ReactElement {
  const relatedSource = document.sources.find(
    (source) => source.id === block.sourceId || (block.url && source.url === block.url),
  )
  return (
    <View key={block.id} style={styles.citation} wrap={false}>
      <Text style={styles.citationLabel}>{block.label || 'Source'}</Text>
      {block.quote ? <Text style={styles.citationQuote}>{block.quote}</Text> : null}
      {block.note ? <Text style={styles.citationQuote}>{block.note}</Text> : null}
      {block.url ? (
        <Text style={styles.urlText}>
          {isSafeLinkHref(block.url) ? (
            <Link src={block.url} style={styles.link}>
              {relatedSource?.title || block.url}
            </Link>
          ) : (
            block.url
          )}
        </Text>
      ) : null}
    </View>
  )
}

function renderBlock(
  block: Block,
  document: StudioDocument,
  images: Map<string, ResolvedImage>,
  theme: ThemeDefinition,
  styles: Styles,
): ReactElement | null {
  switch (block.type) {
    case 'heading':
      return (
        <View key={block.id} minPresenceAhead={40}>
          <Text style={headingStyle(block.level, theme, styles)}>
            <InlineContent html={block.html} styles={styles} />
          </Text>
        </View>
      )
    case 'paragraph': {
      const isCode = block.metadata.format === 'code'
      return (
        <Text
          key={block.id}
          style={isCode ? [styles.paragraph, styles.code] : styles.paragraph}
        >
          <InlineContent html={block.html} styles={styles} />
        </Text>
      )
    }
    case 'list':
      return renderList(block, styles)
    case 'table':
      return renderTable(block, styles)
    case 'image':
      return renderImage(
        block,
        images,
        theme,
        document.exportSettings.pageSize,
        styles,
      )
    case 'video':
      return (
        <View key={block.id} style={styles.videoCard} wrap={false}>
          <Text style={styles.videoLabel}>Video</Text>
          <Text style={styles.citationLabel}>
            {isSafeLinkHref(block.url) ? (
              <Link src={block.url} style={styles.link}>
                {block.title || block.url}
              </Link>
            ) : (
              block.title || block.url
            )}
          </Text>
          {block.caption ? <Text style={styles.urlText}>{block.caption}</Text> : null}
        </View>
      )
    case 'citation':
      return renderCitation(block, document, styles)
    case 'callout':
      return (
        <View key={block.id} style={styles.callout}>
          {block.title ? <Text style={styles.calloutTitle}>{block.title}</Text> : null}
          <Text>
            <InlineContent html={block.html} styles={styles} />
          </Text>
        </View>
      )
    case 'quote':
      return (
        <View key={block.id} style={styles.quote}>
          <Text style={styles.quoteText}>
            <InlineContent html={block.html} styles={styles} />
          </Text>
          {block.attribution ? (
            <Text style={styles.quoteAttribution}>— {block.attribution}</Text>
          ) : null}
          {block.url ? (
            <Text style={styles.urlText}>
              {isSafeLinkHref(block.url) ? (
                <Link src={block.url} style={styles.link}>
                  {block.url}
                </Link>
              ) : (
                block.url
              )}
            </Text>
          ) : null}
        </View>
      )
    case 'divider':
      return <View key={block.id} style={styles.divider} />
    default:
      return null
  }
}

function SourceList({
  sources,
  styles,
}: {
  sources: Source[]
  styles: Styles
}) {
  if (sources.length === 0) return null
  return (
    <View style={styles.sourceList}>
      <Text style={styles.sourceHeading}>Sources</Text>
      {sources.map((source, index) => (
        <Text key={source.id} style={styles.sourceEntry}>
          {index + 1}. {source.label || source.url || 'Source'}
          {source.url ? (
            <>
              {' — '}
              {isSafeLinkHref(source.url) ? (
                <Link src={source.url} style={styles.sourceUrl}>
                  {source.url}
                </Link>
              ) : (
                source.url
              )}
            </>
          ) : null}
        </Text>
      ))}
    </View>
  )
}

export function PdfDocument({ document, images, theme }: PdfDocumentProps) {
  const themeDefinition = getTheme(theme)
  const styles = makeStyles(themeDefinition, document.exportSettings.pageSize)
  const pageSize = document.exportSettings.pageSize === 'letter' ? 'LETTER' : 'A4'

  return (
    <Document
      title={document.title}
      author="Research-to-Document Studio"
      creator="Research-to-Document Studio"
      producer="Research-to-Document Studio"
      subject="Research document"
    >
      <Page size={pageSize} style={styles.page} wrap>
        {document.blocks.map((block) =>
          renderBlock(block, document, images, themeDefinition, styles),
        )}
        {document.exportSettings.includeSourceList ? (
          <SourceList sources={document.sources} styles={styles} />
        ) : null}
        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${document.title}  ·  ${pageNumber} / ${totalPages}`
          }
        />
      </Page>
    </Document>
  )
}
