import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Block, Document as StudioDocument, ListBlock, Source } from '../model/schema'
import { getTheme, themeCssVariables } from '../export/theme'
import { resolveDocumentImages, type ResolvedImage } from '../export/images'
import { InlineContent } from './Inline'
/** Plain text of an inline-HTML field, for comparing against the document title. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * The PDF and DOCX exporters emit the document title as metadata and a running
 * footer, not as a heading block. When the first block is already a level-1
 * heading carrying that same title, printing a masthead above it produced the
 * title twice and made the preview disagree with the export.
 */
function repeatsDocumentTitle(blocks: Block[], title: string): boolean {
  const first = blocks[0]
  if (!first || first.type !== 'heading' || first.level !== 1) return false
  const wanted = title.trim().toLowerCase()
  return wanted.length > 0 && plainText(first.html) === wanted
}


function PreviewList({ block }: { block: ListBlock }) {
  const counters: number[] = []
  return (
    <div className="preview-list">
      {block.items.map((item) => {
        counters[item.depth] = (counters[item.depth] ?? 0) + 1
        for (let depth = item.depth + 1; depth < counters.length; depth += 1) counters[depth] = 0
        const marker = block.ordered ? `${counters[item.depth]}.` : item.depth === 0 ? '•' : '◦'
        return (
          <div className="preview-list-row" key={item.id} style={{ paddingLeft: item.depth * 18 }}>
            <span className="preview-list-marker">{marker}</span>
            <span><InlineContent html={item.html} /></span>
          </div>
        )
      })}
    </div>
  )
}

function PreviewImage({ block, image }: { block: Extract<Block, { type: 'image' }>; image?: ResolvedImage }) {
  const supported = image && (image.imageType === 'png' || image.imageType === 'jpg')
  return (
    <figure className={`preview-image align-${block.align}`}>
      {supported ? (
        <img src={image.dataUrl} alt={block.alt} style={{ width: `${block.widthPercent}%` }} />
      ) : (
        <div className="preview-image-placeholder" style={{ width: `${block.widthPercent}%` }}>
          <strong>Image unavailable</strong>
          <span>{block.alt || block.url || 'No image source'}</span>
        </div>
      )}
      {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      {block.attribution ? <p className="preview-attribution">{block.attribution}</p> : null}
    </figure>
  )
}

function PreviewBlock({ block, images }: { block: Block; images: Map<string, ResolvedImage> }) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      return <Tag><InlineContent html={block.html} /></Tag>
    }
    case 'paragraph':
      return <p className={block.metadata.format === 'code' ? 'preview-code' : ''}><InlineContent html={block.html} /></p>
    case 'list':
      return <PreviewList block={block} />
    case 'table':
      return (
        <figure className="preview-table">
          <table>
            {block.header ? (
              <thead>
                <tr>{block.rows[0]?.map((cell, index) => <th key={index}><InlineContent html={cell} /></th>)}</tr>
              </thead>
            ) : null}
            <tbody>
              {(block.header ? block.rows.slice(1) : block.rows).map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><InlineContent html={cell} /></td>)}</tr>
              ))}
            </tbody>
          </table>
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      )
    case 'image':
      return <PreviewImage block={block} image={images.get(block.id)} />
    case 'video':
      return (
        <div className="preview-video">
          <span className="preview-label">Video</span>
          <strong>{block.title || block.url}</strong>
          {block.url ? <span className="preview-url">{block.url}</span> : null}
          {block.caption ? <span>{block.caption}</span> : null}
        </div>
      )
    case 'citation':
      return (
        <div className="preview-citation">
          <strong>{block.label || 'Source'}</strong>
          {block.quote ? <blockquote>{block.quote}</blockquote> : null}
          {block.note ? <p>{block.note}</p> : null}
          {block.url ? <span className="preview-url">{block.url}</span> : null}
        </div>
      )
    case 'callout':
      return (
        <aside className={`preview-callout callout-${block.variant}`}>
          {block.title ? <strong>{block.title}</strong> : null}
          <p><InlineContent html={block.html} /></p>
        </aside>
      )
    case 'quote':
      return (
        <blockquote className="preview-quote">
          <InlineContent html={block.html} />
          {block.attribution ? <cite>— {block.attribution}</cite> : null}
          {block.url ? <span className="preview-url">{block.url}</span> : null}
        </blockquote>
      )
    case 'divider':
      return <hr />
    default:
      return null
  }
}

function SourceList({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null
  return (
    <section className="preview-sources">
      <h2>Sources</h2>
      <ol>
        {sources.map((source) => (
          <li key={source.id}>
            <span>{source.label || source.title || 'Source'}</span>
            {source.url ? <span className="preview-url">{source.url}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

interface PrintPreviewProps {
  open: boolean
  document: StudioDocument
  onClose: () => void
}

export function PrintPreview({ open, document: studioDocument, onClose }: PrintPreviewProps) {
  const [images, setImages] = useState<Map<string, ResolvedImage>>(new Map())
  const [loading, setLoading] = useState(true)
  const [warnings, setWarnings] = useState(0)
  const theme = getTheme(studioDocument.exportSettings.theme)
  const pageSize = studioDocument.exportSettings.pageSize

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setImages(new Map())
    resolveDocumentImages(studioDocument)
      .then((resolved) => {
        if (!active) return
        setImages(resolved.byBlockId)
        setWarnings(resolved.warnings.length)
      })
      .catch(() => {
        if (active) setWarnings(1)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, studioDocument])

  useEffect(() => {
    if (!open) return
    document.body.classList.add('print-mode')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('print-mode')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="print-portal">
      <style>{`@page { size: ${pageSize}; margin: ${(theme.marginPt / 72).toFixed(2)}in; }`}</style>
      <div className="print-toolbar">
        <div>
          <p className="eyebrow">Print preview</p>
          <strong>{studioDocument.title || 'Untitled document'}</strong>
          {loading ? <span className="muted"> · preparing images…</span> : null}
          {warnings > 0 ? <span className="muted"> · {warnings} image warning{warnings === 1 ? '' : 's'}</span> : null}
        </div>
        <div className="print-actions">
          <button type="button" className="button secondary" onClick={onClose}>Close</button>
          <button type="button" className="button primary" onClick={() => window.print()} disabled={loading}>
            Print / Save as PDF
          </button>
        </div>
      </div>
      <div className="print-stage">
        <article
          className={`print-sheet page-${pageSize}`}
          style={themeCssVariables(theme) as React.CSSProperties}
        >
          {repeatsDocumentTitle(studioDocument.blocks, studioDocument.title || 'Untitled document') ? null : (
            <header className="print-title">
              <h1>{studioDocument.title || 'Untitled document'}</h1>
            </header>
          )}
          {studioDocument.blocks.length === 0 ? (
            <p className="muted">This document has no content yet.</p>
          ) : (
            studioDocument.blocks.map((block) => <PreviewBlock key={block.id} block={block} images={images} />)
          )}
          {studioDocument.exportSettings.includeSourceList ? <SourceList sources={studioDocument.sources} /> : null}
        </article>
      </div>
    </div>,
    document.body,
  )
}
