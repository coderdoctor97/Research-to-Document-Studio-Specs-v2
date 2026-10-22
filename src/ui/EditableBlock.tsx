import type { Block, Document, ListItem } from '../model/schema'
import { BLOCK_TYPE_LABELS } from '../model/schema'
import { newId } from '../model/ids'
import { InlineEditable } from './Inline'
import { useAssetUrl } from './useAsset'

interface EditableBlockProps {
  block: Block
  document: Document
  selected: boolean
  index: number
  count: number
  onSelect: () => void
  onUpdate: (block: Block) => void
  onMove: (delta: number) => void
  onDuplicate: () => void
  onDelete: () => void
  onAddAfter: () => void
  onUploadImage: (file: File) => void
}

function Toolbar({
  block,
  index,
  count,
  onMove,
  onDuplicate,
  onDelete,
  onAddAfter,
}: {
  block: Block
  index: number
  count: number
  onMove: (delta: number) => void
  onDuplicate: () => void
  onDelete: () => void
  onAddAfter: () => void
}) {
  return (
    <div className="block-toolbar" aria-label={`${BLOCK_TYPE_LABELS[block.type]} block actions`}>
      <span className="block-kind">{BLOCK_TYPE_LABELS[block.type]}</span>
      <span className="toolbar-spacer" />
      <button type="button" title="Move block up" aria-label="Move block up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
      <button type="button" title="Move block down" aria-label="Move block down" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
      <button type="button" title="Insert paragraph below" aria-label="Insert paragraph below" onClick={onAddAfter}>＋</button>
      <button type="button" title="Duplicate block" aria-label="Duplicate block" onClick={onDuplicate}>⧉</button>
      <button type="button" title="Delete block" aria-label="Delete block" className="danger-hover" onClick={onDelete}>×</button>
    </div>
  )
}

function ListEditor({ block, onUpdate }: { block: Extract<Block, { type: 'list' }>; onUpdate: (block: Block) => void }) {
  const counters: number[] = []
  const setItems = (items: ListItem[]) => onUpdate({ ...block, items })
  const updateItem = (id: string, next: Partial<ListItem>) => {
    setItems(block.items.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }

  return (
    <div className={`list-block ${block.ordered ? 'ordered' : ''}`}>
      {block.items.map((item, itemIndex) => {
        counters[item.depth] = (counters[item.depth] ?? 0) + 1
        for (let depth = item.depth + 1; depth < counters.length; depth += 1) counters[depth] = 0
        const marker = block.ordered
          ? `${counters[item.depth]}.`
          : item.depth === 0
            ? '•'
            : '◦'
        return (
          <div className="list-row" key={item.id} style={{ paddingLeft: item.depth * 22 }}>
            <span className="list-marker" aria-hidden="true">{marker}</span>
            <InlineEditable
              className="list-item-text"
              html={item.html}
              singleLine
              ariaLabel={`List item ${itemIndex + 1}`}
              placeholder="New point…"
              onCommit={(html) => updateItem(item.id, { html })}
            />
            <span className="list-controls">
              <button
                type="button"
                title="Outdent item"
                aria-label="Outdent item"
                disabled={item.depth === 0}
                onClick={() => updateItem(item.id, { depth: Math.max(0, item.depth - 1) })}
              >←</button>
              <button
                type="button"
                title="Indent item"
                aria-label="Indent item"
                disabled={item.depth >= 6}
                onClick={() => updateItem(item.id, { depth: Math.min(6, item.depth + 1) })}
              >→</button>
              <button
                type="button"
                title="Remove item"
                aria-label="Remove list item"
                onClick={() => setItems(block.items.filter((candidate) => candidate.id !== item.id))}
              >×</button>
            </span>
          </div>
        )
      })}
      <button
        type="button"
        className="small-action"
        onClick={() => {
          const last = block.items[block.items.length - 1]
          setItems([...block.items, { id: newId('li'), html: '', depth: last?.depth ?? 0 }])
        }}
      >
        + Add list item
      </button>
    </div>
  )
}

function TableEditor({ block, onUpdate }: { block: Extract<Block, { type: 'table' }>; onUpdate: (block: Block) => void }) {
  const columns = Math.max(1, ...block.rows.map((row) => row.length))
  const rows = block.rows.length ? block.rows : [['']]
  const setRows = (next: string[][]) => onUpdate({ ...block, rows: next })
  const updateCell = (rowIndex: number, cellIndex: number, html: string) => {
    setRows(rows.map((row, index) => {
      if (index !== rowIndex) return row
      const copy = [...row]
      copy[cellIndex] = html
      return copy
    }))
  }

  return (
    <div className="table-editor">
      <table>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${block.id}-row-${rowIndex}`}>
              {Array.from({ length: columns }, (_, cellIndex) => {
                const isHeader = block.header && rowIndex === 0
                const CellTag = isHeader ? 'th' : 'td'
                return (
                  <CellTag key={`${block.id}-cell-${rowIndex}-${cellIndex}`}>
                    <InlineEditable
                      html={row[cellIndex] ?? ''}
                      ariaLabel={`${isHeader ? 'Header' : 'Cell'} row ${rowIndex + 1}, column ${cellIndex + 1}`}
                      placeholder={isHeader ? 'Header' : 'Cell'}
                      onCommit={(html) => updateCell(rowIndex, cellIndex, html)}
                    />
                  </CellTag>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-controls">
        <button type="button" className="small-action" onClick={() => setRows([...rows, Array.from({ length: columns }, () => '')])}>
          + Row
        </button>
        <button type="button" className="small-action" onClick={() => setRows(rows.map((row) => [...row, '']))}>
          + Column
        </button>
        <button
          type="button"
          className="small-action"
          disabled={rows.length <= 1}
          onClick={() => setRows(rows.slice(0, -1))}
        >
          − Row
        </button>
        <button
          type="button"
          className="small-action"
          disabled={columns <= 1}
          onClick={() => setRows(rows.map((row) => row.slice(0, -1)))}
        >
          − Column
        </button>
      </div>
      <input
        className="caption-input"
        value={block.caption}
        onChange={(event) => onUpdate({ ...block, caption: event.target.value })}
        placeholder="Table caption (optional)"
        aria-label="Table caption"
      />
    </div>
  )
}

function ImageEditor({
  block,
  document,
  onUpdate,
  onUploadImage,
}: {
  block: Extract<Block, { type: 'image' }>
  document: Document
  onUpdate: (block: Block) => void
  onUploadImage: (file: File) => void
}) {
  const asset = document.assets.find((candidate) => candidate.id === block.assetId)
  const remoteUrl = block.url || asset?.originalUrl
  const { src, loading, error } = useAssetUrl(block.assetId, remoteUrl)

  return (
    <figure className={`image-block align-${block.align}`}>
      {src ? (
        <img
          src={src}
          alt={block.alt || asset?.alt || ''}
          style={{ width: `${block.widthPercent}%` }}
        />
      ) : (
        <div className="image-placeholder" style={{ width: `${block.widthPercent}%` }}>
          <strong>{loading ? 'Loading your image…' : 'Image unavailable'}</strong>
          <span>{block.alt || 'No alt text yet'}</span>
          {error ? <span>{error}</span> : null}
          {!loading ? (
            <label className="button secondary compact">
              Choose an image file
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onUploadImage(file)
                  event.target.value = ''
                }}
              />
            </label>
          ) : null}
        </div>
      )}
      <figcaption>
        <input
          className="caption-input"
          value={block.caption}
          onChange={(event) => onUpdate({ ...block, caption: event.target.value })}
          placeholder="Image caption (optional)"
          aria-label="Image caption"
        />
        {(block.attribution || asset?.attribution) ? (
          <span className="attribution">{block.attribution || asset?.attribution}</span>
        ) : null}
      </figcaption>
    </figure>
  )
}

const labelFor = (type: string) => type.charAt(0).toUpperCase() + type.slice(1)

export function EditableBlock({
  block,
  document,
  selected,
  index,
  count,
  onSelect,
  onUpdate,
  onMove,
  onDuplicate,
  onDelete,
  onAddAfter,
  onUploadImage,
}: EditableBlockProps) {
  const headingClass = block.type === 'heading' ? `heading-level-${block.level}` : ''
  const codeClass = block.type === 'paragraph' && block.metadata.format === 'code' ? 'block-code' : ''

  return (
    <article
      id={`block-${block.id}`}
      className={`editor-block ${selected ? 'selected' : ''} block-type-${block.type}`}
      onMouseDown={() => onSelect()}
      onFocusCapture={() => onSelect()}
    >
      <Toolbar
        block={block}
        index={index}
        count={count}
        onMove={onMove}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onAddAfter={onAddAfter}
      />
      <div className={`block-body ${headingClass} ${codeClass}`.trim()}>
        {block.type === 'heading' ? (
          <InlineEditable
            className="heading-content"
            html={block.html}
            singleLine
            ariaLabel={`Heading ${block.level}`}
            placeholder="Section heading…"
            onCommit={(html) => onUpdate({ ...block, html })}
          />
        ) : null}

        {block.type === 'paragraph' ? (
          <InlineEditable
            className="paragraph-content"
            html={block.html}
            ariaLabel="Paragraph"
            placeholder="Start writing, or drag in source material."
            onCommit={(html) => onUpdate({ ...block, html })}
          />
        ) : null}

        {block.type === 'list' ? <ListEditor block={block} onUpdate={onUpdate} /> : null}
        {block.type === 'table' ? <TableEditor block={block} onUpdate={onUpdate} /> : null}
        {block.type === 'image' ? (
          <ImageEditor block={block} document={document} onUpdate={onUpdate} onUploadImage={onUploadImage} />
        ) : null}

        {block.type === 'video' ? (
          <div className="video-block">
            <span className="video-label">Video reference</span>
            <input
              className="title-input"
              value={block.title}
              onChange={(event) => onUpdate({ ...block, title: event.target.value })}
              placeholder="Video title (shown to readers)"
              aria-label="Video title"
            />
            <input
              className="url-input"
              value={block.url}
              onChange={(event) => onUpdate({ ...block, url: event.target.value })}
              placeholder="https://…"
              aria-label="Video URL"
            />
            {/^https?:\/\//i.test(block.url) ? (
              <a href={block.url} target="_blank" rel="noreferrer noopener" className="source-link">
                Open source ↗
              </a>
            ) : (
              <span className="muted">Add a full https:// address and readers will get a clickable link. Videos are never embedded.</span>
            )}
            <input
              className="caption-input"
              value={block.caption}
              onChange={(event) => onUpdate({ ...block, caption: event.target.value })}
              placeholder="Caption (optional)"
              aria-label="Video caption"
            />
          </div>
        ) : null}

        {block.type === 'citation' ? (
          <div className="citation-block">
            <div className="citation-flag">Citation</div>
            <input
              className="title-input"
              value={block.label}
              onChange={(event) => onUpdate({ ...block, label: event.target.value })}
              placeholder="Source label — e.g. author, year or publication"
              aria-label="Citation label"
            />
            <textarea
              value={block.quote}
              onChange={(event) => onUpdate({ ...block, quote: event.target.value })}
              placeholder="Exact quoted passage (optional)"
              aria-label="Citation quote"
              rows={2}
            />
            <input
              className="url-input"
              value={block.url}
              onChange={(event) => onUpdate({ ...block, url: event.target.value })}
              placeholder="https://… (optional)"
              aria-label="Citation URL"
            />
            <textarea
              value={block.note}
              onChange={(event) => onUpdate({ ...block, note: event.target.value })}
              placeholder="Note on how this source is used (optional)"
              aria-label="Citation note"
              rows={2}
            />
          </div>
        ) : null}

        {block.type === 'callout' ? (
          <div className={`callout-block callout-${block.variant}`}>
            <input
              className="title-input"
              value={block.title}
              onChange={(event) => onUpdate({ ...block, title: event.target.value })}
              placeholder={labelFor(block.variant)}
              aria-label="Callout title"
            />
            <InlineEditable
              html={block.html}
              ariaLabel="Callout text"
              placeholder="The one thing readers must not miss…"
              onCommit={(html) => onUpdate({ ...block, html })}
            />
          </div>
        ) : null}

        {block.type === 'quote' ? (
          <blockquote className="quote-block">
            <InlineEditable
              html={block.html}
              ariaLabel="Quoted text"
              placeholder="Paste the passage word for word…"
              onCommit={(html) => onUpdate({ ...block, html })}
            />
            <div className="quote-meta">
              <input
                value={block.attribution}
                onChange={(event) => onUpdate({ ...block, attribution: event.target.value })}
                placeholder="Who said it?"
                aria-label="Quote attribution"
              />
              <input
                value={block.url}
                onChange={(event) => onUpdate({ ...block, url: event.target.value })}
                placeholder="Source URL (optional)"
                aria-label="Quote source URL"
              />
            </div>
          </blockquote>
        ) : null}

        {block.type === 'divider' ? <hr className="block-divider" /> : null}
      </div>
    </article>
  )
}
