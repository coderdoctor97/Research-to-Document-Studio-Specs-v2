import { useMemo, useState } from 'react'
import type { Asset, Block, Document as StudioDocument, ImportRecord, Source } from '../model/schema'
import { THEMES } from '../export/theme'
import { documentStats, outlineFromDocument } from '../editor/operations'
import { newId } from '../model/ids'
import {
  buildDraftPrompt,
  buildSourceIntakePrompt,
  buildStructurePrompt,
  ORGANIZER_SKILL_PATH,
} from '../ai/prompts'
import { copyText } from './clipboard'
import { assetStatusLabel, formatDate } from './format'
import { useAssetThumbnails } from './useAsset'

export type InspectorTab = 'document' | 'block' | 'sources' | 'media' | 'ai'

interface InspectorProps {
  document: StudioDocument
  selectedBlockId: string | null
  tab: InspectorTab
  onTab: (tab: InspectorTab) => void
  onDocumentChange: (document: StudioDocument) => void
  onBlockChange: (block: Block) => void
  onSelectBlock: (blockId: string) => void
  onDownloadImport: (record: ImportRecord) => void
  onOpenImport: () => void
  onUploadImage: (blockId: string, file: File) => Promise<void>
  onUploadRegistryImage: (file: File) => Promise<void>
  onInsertAsset: (assetId: string) => void
  onNotify: (message: string, tone?: 'info' | 'error') => void
}

function BlockProperties({
  document: studioDocument,
  block,
  onChange,
  onUploadImage,
}: {
  document: StudioDocument
  block: Block
  onChange: (block: Block) => void
  onUploadImage: (file: File) => Promise<void>
}) {
  const sources = studioDocument.sources.filter((source) => block.sourceRefs.includes(source.id))

  return (
    <div className="inspector-section">
      <p className="inspector-kicker">{block.type} block</p>

      {block.type === 'heading' ? (
        <label className="field">
          <span>Heading level</span>
          <select value={block.level} onChange={(event) => onChange({ ...block, level: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>H{level}</option>)}
          </select>
        </label>
      ) : null}

      {block.type === 'paragraph' ? (
        <label className="check-field">
          <input
            type="checkbox"
            checked={block.metadata.format === 'code'}
            onChange={(event) => onChange({
              ...block,
              metadata: { ...block.metadata, format: event.target.checked ? 'code' : undefined },
            })}
          />
          <span>Monospace code block</span>
        </label>
      ) : null}

      {block.type === 'list' ? (
        <div className="inspector-stack">
          <label className="check-field">
            <input type="checkbox" checked={block.ordered} onChange={(event) => onChange({ ...block, ordered: event.target.checked })} />
            <span>Numbered list</span>
          </label>
          <p className="muted small">{block.items.length} item{block.items.length === 1 ? '' : 's'}. Edit indentation on each row.</p>
        </div>
      ) : null}

      {block.type === 'table' ? (
        <label className="check-field">
          <input type="checkbox" checked={block.header} onChange={(event) => onChange({ ...block, header: event.target.checked })} />
          <span>First row is a header</span>
        </label>
      ) : null}

      {block.type === 'callout' ? (
        <label className="field">
          <span>Callout style</span>
          <select value={block.variant} onChange={(event) => onChange({ ...block, variant: event.target.value as 'info' | 'warning' | 'tip' })}>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="tip">Tip</option>
          </select>
        </label>
      ) : null}

      {block.type === 'image' ? (
        <>
          <label className="field">
            <span>Alt text (required for accessibility)</span>
            <input value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} placeholder="Describe the image" />
          </label>
          <label className="field">
            <span>Caption</span>
            <input value={block.caption} onChange={(event) => onChange({ ...block, caption: event.target.value })} />
          </label>
          <label className="field">
            <span>Attribution</span>
            <input value={block.attribution} onChange={(event) => onChange({ ...block, attribution: event.target.value })} placeholder="Creator or rights holder" />
          </label>
          <label className="field">
            <span>Image URL (fallback / remote)</span>
            <input value={block.url ?? ''} onChange={(event) => onChange({ ...block, url: event.target.value, status: event.target.value ? 'remote' : block.status })} placeholder="https://…" />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Alignment</span>
              <select value={block.align} onChange={(event) => onChange({ ...block, align: event.target.value as 'left' | 'center' | 'right' | 'full' })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="full">Full width</option>
              </select>
            </label>
            <label className="field">
              <span>Width · {block.widthPercent}%</span>
              <input type="range" min={10} max={100} step={5} value={block.widthPercent} onChange={(event) => onChange({ ...block, widthPercent: Number(event.target.value) })} />
            </label>
          </div>
          <p className="muted small">Status: {assetStatusLabel(block.status)}{block.assetId ? ` · asset ${block.assetId.slice(0, 18)}…` : ''}</p>
          <label className="button secondary file-picker">
            {block.assetId ? 'Replace saved image' : 'Upload image file'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void onUploadImage(file)
                event.target.value = ''
              }}
            />
          </label>
          {block.assetId ? (
            <button
              type="button"
              className="text-button danger"
              onClick={() => onChange({ ...block, assetId: undefined, status: block.url ? 'remote' : 'unresolved' })}
            >
              Detach saved image
            </button>
          ) : null}
        </>
      ) : null}

      {block.type === 'citation' ? (
        <>
          <label className="field">
            <span>Linked source</span>
            <select
              value={block.sourceId ?? ''}
              onChange={(event) => onChange({ ...block, sourceId: event.target.value || undefined })}
            >
              <option value="">No linked source</option>
              {studioDocument.sources.map((source) => (
                <option key={source.id} value={source.id}>{source.label || source.url || 'Untitled source'}</option>
              ))}
            </select>
          </label>
          <p className="muted small">Label, quote, URL and note are edited on the block.</p>
        </>
      ) : null}

      {block.type === 'video' ? (
        <p className="muted small">The video URL is preserved as a reference. Embedded players are not loaded in the editor or exports.</p>
      ) : null}

      <div className="inspector-divider" />
      <p className="inspector-kicker">Provenance</p>
      {sources.length > 0 ? (
        <div className="chip-list">
          {sources.map((source) => (
            <a key={source.id} className="chip" href={source.url || undefined} target="_blank" rel="noreferrer noopener">
              {source.label || source.url || 'Source'}
            </a>
          ))}
        </div>
      ) : (
        <p className="muted small">No linked sources on this block. Links inside its text remain in the source list when imported.</p>
      )}
      <dl className="meta-list">
        <div><dt>Block ID</dt><dd>{block.id}</dd></div>
        <div><dt>Origin</dt><dd>{String(block.metadata.origin ?? 'unknown')}</dd></div>
      </dl>
    </div>
  )
}

function DocumentProperties({
  document: studioDocument,
  onDocumentChange,
  onDownloadImport,
  onOpenImport,
}: {
  document: StudioDocument
  onDocumentChange: (document: StudioDocument) => void
  onDownloadImport: (record: ImportRecord) => void
  onOpenImport: () => void
}) {
  const stats = documentStats(studioDocument)
  const outline = outlineFromDocument(studioDocument)
  const [openImportId, setOpenImportId] = useState<string | null>(null)

  return (
    <div className="inspector-section">
      <p className="inspector-kicker">Document settings</p>
      <label className="field">
        <span>PDF / DOCX theme</span>
        <select
          value={studioDocument.exportSettings.theme}
          onChange={(event) => onDocumentChange({
            ...studioDocument,
            exportSettings: { ...studioDocument.exportSettings, theme: event.target.value as StudioDocument['exportSettings']['theme'] },
          })}
        >
          {Object.values(THEMES).map((theme) => <option key={theme.id} value={theme.id}>{theme.name} — {theme.description}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Page size</span>
        <select
          value={studioDocument.exportSettings.pageSize}
          onChange={(event) => onDocumentChange({
            ...studioDocument,
            exportSettings: { ...studioDocument.exportSettings, pageSize: event.target.value as StudioDocument['exportSettings']['pageSize'] },
          })}
        >
          <option value="a4">A4</option>
          <option value="letter">US Letter</option>
        </select>
      </label>
      <label className="check-field">
        <input
          type="checkbox"
          checked={studioDocument.exportSettings.includeSourceList}
          onChange={(event) => onDocumentChange({
            ...studioDocument,
            exportSettings: { ...studioDocument.exportSettings, includeSourceList: event.target.checked },
          })}
        />
        <span>Append a source list to exports</span>
      </label>

      <div className="inspector-divider" />
      <p className="inspector-kicker">At a glance</p>
      <dl className="stat-grid">
        <div><dt>Words</dt><dd>{stats.words.toLocaleString()}</dd></div>
        <div><dt>Blocks</dt><dd>{stats.blocks}</dd></div>
        <div><dt>Headings</dt><dd>{stats.headings}</dd></div>
        <div><dt>Sources</dt><dd>{stats.sources}</dd></div>
        <div><dt>Images</dt><dd>{stats.images}</dd></div>
        <div><dt>Citations</dt><dd>{stats.citations}</dd></div>
      </dl>
      {outline.length > 0 ? (
        <p className="muted small">Outline depth: {Math.max(...outline.map((heading) => heading.level))} levels.</p>
      ) : null}

      <div className="inspector-divider" />
      <div className="section-heading">
        <p className="inspector-kicker">Imports</p>
        <button type="button" className="text-button" onClick={onOpenImport}>+ Add import</button>
      </div>
      {studioDocument.imports.length === 0 ? (
        <p className="muted small">No imports yet. Source files and originals will be listed here.</p>
      ) : (
        <div className="import-list">
          {studioDocument.imports.map((record) => (
            <div className="import-row" key={record.id}>
              <div className="import-row-main">
                <span className="format-badge">{record.format.toUpperCase()}</span>
                <div>
                  <strong>{record.fileName || 'Pasted content'}</strong>
                  <p className="muted small">{formatDate(record.importedAt)}</p>
                </div>
              </div>
              <div className="import-row-actions">
                {record.warnings.length > 0 ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setOpenImportId(openImportId === record.id ? null : record.id)}
                  >
                    {record.warnings.length} warning{record.warnings.length === 1 ? '' : 's'}
                  </button>
                ) : null}
                {record.originalAvailable && record.blobKey ? (
                  <button type="button" className="text-button" onClick={() => onDownloadImport(record)}>
                    Download original
                  </button>
                ) : (
                  <span className="muted small">Original unavailable</span>
                )}
              </div>
              {openImportId === record.id ? (
                <ul className="import-warnings">
                  {record.warnings.map((warning, index) => <li key={`${record.id}-${index}`}>{warning}</li>)}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SourcesPanel({
  document: studioDocument,
  onDocumentChange,
}: {
  document: StudioDocument
  onDocumentChange: (document: StudioDocument) => void
}) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  const addSource = () => {
    const trimmedUrl = url.trim()
    const trimmedLabel = label.trim()
    if (!trimmedUrl && !trimmedLabel) return
    const source: Source = {
      id: newId('src'),
      label: trimmedLabel || trimmedUrl,
      url: trimmedUrl || undefined,
      kind: /^https?:\/\//i.test(trimmedUrl) ? 'web' : 'unknown',
      accessedAt: new Date().toISOString(),
    }
    onDocumentChange({ ...studioDocument, sources: [...studioDocument.sources, source] })
    setLabel('')
    setUrl('')
  }

  const removeSource = (source: Source) => {
    if (!window.confirm('Remove this source? Citations keep their own label, quote and URL.')) return
    onDocumentChange({
      ...studioDocument,
      sources: studioDocument.sources.filter((candidate) => candidate.id !== source.id),
      blocks: studioDocument.blocks.map((block) =>
        block.type === 'citation' && block.sourceId === source.id ? { ...block, sourceId: undefined } : block,
      ),
    })
  }

  return (
    <div className="inspector-section">
      <p className="inspector-kicker">Source registry</p>
      <p className="muted small">Every imported link is recorded here. Citations can point at a registered source.</p>
      <div className="source-form">
        <label className="field"><span>Label</span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Author or publication" /></label>
        <label className="field"><span>URL</span><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
        <button type="button" className="button secondary compact" onClick={addSource} disabled={!label.trim() && !url.trim()}>
          Add source
        </button>
      </div>
      <div className="inspector-divider" />
      {studioDocument.sources.length === 0 ? (
        <p className="muted small">No sources registered.</p>
      ) : (
        <ol className="source-list">
          {studioDocument.sources.map((source) => (
            <li key={source.id}>
              <div>
                <strong>{source.label || 'Untitled source'}</strong>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer noopener" className="source-url">{source.url}</a>
                ) : null}
                <span className="muted small">{source.kind}{source.accessedAt ? ` · accessed ${formatDate(source.accessedAt)}` : ''}</span>
              </div>
              <button type="button" className="text-button danger" onClick={() => removeSource(source)}>Remove</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function MediaPanel({
  document: studioDocument,
  onDocumentChange,
  onUploadRegistryImage,
  onInsertAsset,
  onNotify,
}: {
  document: StudioDocument
  onDocumentChange: (document: StudioDocument) => void
  onUploadRegistryImage: (file: File) => Promise<void>
  onInsertAsset: (assetId: string) => void
  onNotify: (message: string, tone?: 'info' | 'error') => void
}) {
  const thumbnails = useAssetThumbnails(studioDocument.assets)
  const updateAsset = (assetId: string, patch: Partial<Asset>) => {
    onDocumentChange({
      ...studioDocument,
      assets: studioDocument.assets.map((asset) => asset.id === assetId ? { ...asset, ...patch } : asset),
    })
  }
  const usage = (assetId: string) => studioDocument.blocks.filter((block) => block.type === 'image' && block.assetId === assetId).length

  return (
    <div className="inspector-section">
      <div className="section-heading">
        <p className="inspector-kicker">Media registry</p>
        <label className="text-button file-picker">
          + Upload image
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onUploadRegistryImage(file)
              event.target.value = ''
            }}
          />
        </label>
      </div>
      <p className="muted small">Images live in local browser storage. Remote URLs stay as references until embedded at export.</p>
      {studioDocument.assets.length === 0 ? (
        <p className="muted small">No media assets yet. Import an HTML or DOCX file, or upload an image.</p>
      ) : (
        <div className="media-list">
          {studioDocument.assets.map((asset) => {
            const used = usage(asset.id)
            return (
              <div className="media-card" key={asset.id}>
                <div className="media-thumb">
                  {thumbnails[asset.id] ? (
                    <img src={thumbnails[asset.id]} alt="" />
                  ) : (
                    <span>{asset.mimeType?.split('/')[1]?.toUpperCase() || 'IMG'}</span>
                  )}
                </div>
                <div className="media-body">
                  <strong>{asset.alt || '(no alt text)'}</strong>
                  <span className="muted small">{assetStatusLabel(asset.status)} · {used} use{used === 1 ? '' : 's'}</span>
                  {asset.mimeType ? <span className="muted small">{asset.mimeType}{asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ''}</span> : null}
                  {asset.originalUrl ? <a className="source-url" href={asset.originalUrl} target="_blank" rel="noreferrer noopener">{asset.originalUrl}</a> : null}
                  <label className="field compact-field">
                    <span>Alt text</span>
                    <input value={asset.alt} onChange={(event) => updateAsset(asset.id, { alt: event.target.value })} />
                  </label>
                  <label className="field compact-field">
                    <span>Caption</span>
                    <input value={asset.caption} onChange={(event) => updateAsset(asset.id, { caption: event.target.value })} />
                  </label>
                  <div className="media-actions">
                    <button type="button" className="text-button" onClick={() => onInsertAsset(asset.id)}>Insert image block</button>
                    <button
                      type="button"
                      className="text-button danger"
                      disabled={used > 0}
                      title={used > 0 ? 'Remove the image blocks first' : 'Remove from registry'}
                      onClick={() => {
                        if (used > 0) {
                          onNotify('This asset is used by an image block and cannot be removed from the registry.', 'error')
                          return
                        }
                        onDocumentChange({
                          ...studioDocument,
                          assets: studioDocument.assets.filter((candidate) => candidate.id !== asset.id),
                        })
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AiPanel({ document: studioDocument, onNotify }: { document: StudioDocument; onNotify: (message: string, tone?: 'info' | 'error') => void }) {
  const [kind, setKind] = useState<'structure' | 'draft' | 'intake'>('structure')
  const prompt = useMemo(() => {
    if (kind === 'draft') return buildDraftPrompt(studioDocument)
    if (kind === 'intake') return buildSourceIntakePrompt()
    return buildStructurePrompt(studioDocument)
  }, [kind, studioDocument])

  return (
    <div className="inspector-section">
      <p className="inspector-kicker">AI assistant prompts</p>
      <p className="muted small">
        This studio does not call a model. Copy a prompt into your own assistant, then paste the Markdown result back through Import. The reusable skill lives at <code>{ORGANIZER_SKILL_PATH}</code>.
      </p>
      <div className="segmented wrap" role="group" aria-label="Prompt type">
        <button type="button" className={kind === 'structure' ? 'active' : ''} onClick={() => setKind('structure')}>Structure</button>
        <button type="button" className={kind === 'draft' ? 'active' : ''} onClick={() => setKind('draft')}>Draft</button>
        <button type="button" className={kind === 'intake' ? 'active' : ''} onClick={() => setKind('intake')}>Source intake</button>
      </div>
      <textarea className="prompt-area" readOnly value={prompt} rows={16} aria-label="AI prompt" />
      <div className="button-row">
        <button
          type="button"
          className="button primary compact"
          onClick={async () => {
            const ok = await copyText(prompt)
            onNotify(ok ? 'Prompt copied to clipboard.' : 'Clipboard access was blocked. Select the text and copy manually.', ok ? 'info' : 'error')
          }}
        >
          Copy prompt
        </button>
        <button
          type="button"
          className="button secondary compact"
          onClick={async () => {
            const ok = await copyText(ORGANIZER_SKILL_PATH)
            onNotify(ok ? 'Skill path copied.' : 'Clipboard access was blocked.', ok ? 'info' : 'error')
          }}
        >
          Copy skill path
        </button>
      </div>
      <div className="inspector-divider" />
      <p className="inspector-kicker">How to round-trip</p>
      <ol className="steps-list">
        <li>Copy a prompt and supply your source notes to your assistant.</li>
        <li>Ask for Markdown, with links and quotes preserved.</li>
        <li>Use Import → Paste → Markdown to review and append the result.</li>
        <li>Check every citation in the source registry before export.</li>
      </ol>
    </div>
  )
}

const TABS: Array<{ id: InspectorTab; label: string }> = [
  { id: 'document', label: 'Document' },
  { id: 'block', label: 'Block' },
  { id: 'sources', label: 'Sources' },
  { id: 'media', label: 'Media' },
  { id: 'ai', label: 'AI' },
]

export function Inspector({
  document: studioDocument,
  selectedBlockId,
  tab,
  onTab,
  onDocumentChange,
  onBlockChange,
  onSelectBlock,
  onDownloadImport,
  onOpenImport,
  onUploadImage,
  onUploadRegistryImage,
  onInsertAsset,
  onNotify,
}: InspectorProps) {
  const selectedBlock = studioDocument.blocks.find((block) => block.id === selectedBlockId) ?? null

  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="inspector-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'active' : ''}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="inspector-scroll">
        {tab === 'document' ? (
          <DocumentProperties
            document={studioDocument}
            onDocumentChange={onDocumentChange}
            onDownloadImport={onDownloadImport}
            onOpenImport={onOpenImport}
          />
        ) : null}
        {tab === 'block' ? (
          selectedBlock ? (
            <BlockProperties
              document={studioDocument}
              block={selectedBlock}
              onChange={onBlockChange}
              onUploadImage={(file) => onUploadImage(selectedBlock.id, file)}
            />
          ) : (
            <div className="inspector-section">
              <p className="inspector-kicker">No block selected</p>
              <p className="muted small">Select a block in the document to edit its type-specific settings and see provenance.</p>
              {studioDocument.blocks.length > 0 ? (
                <button type="button" className="button secondary compact" onClick={() => onSelectBlock(studioDocument.blocks[0].id)}>
                  Select first block
                </button>
              ) : null}
            </div>
          )
        ) : null}
        {tab === 'sources' ? (
          <SourcesPanel document={studioDocument} onDocumentChange={onDocumentChange} />
        ) : null}
        {tab === 'media' ? (
          <MediaPanel
            document={studioDocument}
            onDocumentChange={onDocumentChange}
            onUploadRegistryImage={onUploadRegistryImage}
            onInsertAsset={onInsertAsset}
            onNotify={onNotify}
          />
        ) : null}
        {tab === 'ai' ? <AiPanel document={studioDocument} onNotify={onNotify} /> : null}
      </div>
    </aside>
  )
}
