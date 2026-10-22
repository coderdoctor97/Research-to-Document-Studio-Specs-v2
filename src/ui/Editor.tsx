import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Asset, Block, BlockType, Document as StudioDocument, ImportRecord } from '../model/schema'
import { BLOCK_TYPE_LABELS } from '../model/schema'
import { createBlock } from '../model/factory'
import { newId } from '../model/ids'
import {
  deleteBlock,
  documentStats,
  duplicateBlock,
  insertBlock,
  moveBlockBy,
  outlineFromDocument,
  updateBlock,
} from '../editor/operations'
import { touchDocument } from '../model/factory'
import {
  getImportOriginal,
  loadDocument,
  saveAssetBlob,
  saveDocument,
} from '../storage/repository'
import { appendImport, documentFromImport } from '../studio/importCommit'
import type { ImportPreview } from '../import'
import { formatFromFileName } from '../import/types'
import { MAX_IMPORT_BYTES } from '../import'
import { downloadBlob } from '../export/types'
import { EditableBlock } from './EditableBlock'
import { ImportDialog } from './ImportDialog'
import { Inspector, type InspectorTab } from './Inspector'
import { ExportDialog } from './ExportDialog'
import { PrintPreview } from './PrintPreview'
import { InlineContent } from './Inline'
import { downloadNameForImport, formatBytes, relativeDate } from './format'

interface History {
  present: StudioDocument
  past: StudioDocument[]
  future: StudioDocument[]
}

interface EditorProps {
  projectId: string
  onBack: () => void
  onOpenProject: (projectId: string) => void
  onNotify: (message: string, tone?: 'info' | 'error') => void
}

const INSERTABLE: BlockType[] = [
  'heading',
  'paragraph',
  'list',
  'table',
  'image',
  'video',
  'citation',
  'callout',
  'quote',
  'divider',
]

const BLOCK_HINTS: Record<BlockType, string> = {
  heading: 'Start a section',
  paragraph: 'Body text',
  list: 'Bulleted or numbered',
  table: 'Structured data',
  image: 'Stored locally',
  video: 'Reference link',
  citation: 'Evidence card',
  callout: 'Call attention',
  quote: 'Exact passage',
  divider: 'Section break',
}

function mimeFromName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase()
  if (extension === 'png') return 'image/png'
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'gif') return 'image/gif'
  if (extension === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth || undefined, height: image.naturalHeight || undefined })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({})
    }
    image.src = url
  })
}

export function Editor({ projectId, onBack, onOpenProject, onNotify }: EditorProps) {
  const [history, setHistory] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved')
  const [saveError, setSaveError] = useState('')
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('document')
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const versionRef = useRef(0)
  const dragDepth = useRef(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError('')
    loadDocument(projectId)
      .then((loaded) => {
        if (!active) return
        setHistory({ present: loaded, past: [], future: [] })
        setTitleDraft(loaded.title)
        setSelectedBlockId(loaded.blocks[0]?.id ?? null)
        setDirty(false)
        setSaveState('saved')
        setSaveError('')
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoadError(error instanceof Error ? error.message : 'The project could not be opened.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId])

  const applyDocument = useCallback((updater: (document: StudioDocument) => StudioDocument) => {
    setHistory((previous) => {
      if (!previous) return previous
      const candidate = updater(previous.present)
      if (candidate === previous.present) return previous
      versionRef.current += 1
      return {
        present: touchDocument(candidate),
        past: [...previous.past, previous.present].slice(-80),
        future: [],
      }
    })
    setDirty(true)
    setSaveState('dirty')
  }, [])

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!history) return false
    const title = titleDraft.trim() || 'Untitled document'
    const base = history.present
    const target = title === base.title
      ? base
      : { ...base, title, updatedAt: new Date().toISOString() }
    if (title !== titleDraft) setTitleDraft(title)
    if (target !== base) {
      setHistory((previous) => previous
        ? {
            present: target,
            past: [...previous.past, previous.present].slice(-80),
            future: [],
          }
        : previous)
    }
    versionRef.current += 1
    const version = versionRef.current
    setSaveState('saving')
    setSaveError('')
    try {
      await saveDocument(target)
      if (versionRef.current === version) {
        setDirty(false)
        setSaveState('saved')
      }
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The project could not be saved.'
      setSaveState('error')
      setSaveError(message)
      onNotify(message, 'error')
      return false
    }
  }, [history, titleDraft, onNotify])

  useEffect(() => {
    if (!history || !dirty) return
    const documentToSave = history.present
    const version = versionRef.current
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      saveDocument(documentToSave)
        .then(() => {
          if (versionRef.current === version) {
            setDirty(false)
            setSaveState('saved')
            setSaveError('')
          }
        })
        .catch((error: unknown) => {
          if (versionRef.current !== version) return
          setSaveState('error')
          setSaveError(error instanceof Error ? error.message : 'Autosave failed.')
        })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [history, dirty])

  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  useEffect(() => {
    if (!selectedBlockId) return
    const node = document.getElementById(`block-${selectedBlockId}`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [selectedBlockId])

  const undo = useCallback(() => {
    setHistory((previous) => {
      if (!previous || previous.past.length === 0) return previous
      const prior = previous.past[previous.past.length - 1]
      versionRef.current += 1
      return {
        present: touchDocument(prior),
        past: previous.past.slice(0, -1),
        future: [previous.present, ...previous.future].slice(0, 80),
      }
    })
    setDirty(true)
    setSaveState('dirty')
  }, [])

  const redo = useCallback(() => {
    setHistory((previous) => {
      if (!previous || previous.future.length === 0) return previous
      const next = previous.future[0]
      versionRef.current += 1
      return {
        present: touchDocument(next),
        past: [...previous.past, previous.present].slice(-80),
        future: previous.future.slice(1),
      }
    })
    setDirty(true)
    setSaveState('dirty')
  }, [])

  const commitTitle = useCallback(() => {
    if (!history) return
    const clean = titleDraft.trim() || 'Untitled document'
    setTitleDraft(clean)
    if (clean !== history.present.title) {
      applyDocument((document) => ({ ...document, title: clean }))
    }
  }, [history, titleDraft, applyDocument])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      const editing = Boolean(target?.isContentEditable) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        void saveNow()
        return
      }
      if (key === 'p') {
        event.preventDefault()
        setPrintOpen(true)
        return
      }
      if (!editing && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (!editing && key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveNow, undo, redo])

  const stats = useMemo(() => (history ? documentStats(history.present) : null), [history])
  const outline = useMemo(() => (history ? outlineFromDocument(history.present) : []), [history])

  const addBlock = useCallback((type: BlockType) => {
    if (!history) return
    const block = createBlock(type)
    const selectedIndex = selectedBlockId
      ? history.present.blocks.findIndex((candidate) => candidate.id === selectedBlockId)
      : -1
    const index = selectedIndex >= 0 ? selectedIndex + 1 : history.present.blocks.length
    applyDocument((document) => insertBlock(document, block, index))
    setSelectedBlockId(block.id)
    setLeftOpen(false)
    window.setTimeout(() => {
      document.getElementById(`block-${block.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 30)
  }, [history, selectedBlockId, applyDocument])

  const handleBlockChange = useCallback((block: Block) => {
    setHistory((previous) => {
      if (!previous) return previous
      const next = updateBlock(previous.present, block.id, () => block)
      if (next === previous.present) return previous
      versionRef.current += 1
      return {
        present: touchDocument(next),
        past: [...previous.past, previous.present].slice(-80),
        future: [],
      }
    })
    setDirty(true)
    setSaveState('dirty')
  }, [])

  const handleDelete = (blockId: string) => {
    if (!history) return
    const index = history.present.blocks.findIndex((block) => block.id === blockId)
    applyDocument((document) => deleteBlock(document, blockId))
    const remaining = history.present.blocks.filter((block) => block.id !== blockId)
    const next = remaining[Math.min(index, remaining.length - 1)]
    setSelectedBlockId(next?.id ?? null)
  }

  const storeImage = useCallback(async (file: File): Promise<Asset> => {
    if (!file.type.startsWith('image/')) {
      throw new Error('Choose a PNG, JPEG, GIF or WebP image.')
    }
    if (file.size > MAX_IMPORT_BYTES) {
      throw new Error(`Image files must be smaller than ${formatBytes(MAX_IMPORT_BYTES)}.`)
    }
    const dimensions = await readImageDimensions(file)
    const id = newId('asset')
    await saveAssetBlob(id, file, file.type || mimeFromName(file.name))
    return {
      id,
      kind: 'image',
      storageKey: id,
      mimeType: file.type || mimeFromName(file.name),
      width: dimensions.width,
      height: dimensions.height,
      alt: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
      caption: '',
      attribution: '',
      status: 'local',
      retrievedAt: new Date().toISOString(),
    }
  }, [])

  const uploadBlockImage = useCallback(async (blockId: string, file: File) => {
    try {
      const asset = await storeImage(file)
      setHistory((previous) => {
        if (!previous) return previous
        const blocks = previous.present.blocks.map((block) => {
          if (block.id !== blockId || block.type !== 'image') return block
          return {
            ...block,
            assetId: asset.id,
            status: 'local' as const,
            alt: block.alt || asset.alt,
          }
        })
        versionRef.current += 1
        return {
          present: touchDocument({
            ...previous.present,
            assets: [...previous.present.assets, asset],
            blocks,
          }),
          past: [...previous.past, previous.present].slice(-80),
          future: [],
        }
      })
      setDirty(true)
      setSaveState('dirty')
      onNotify('Image saved locally and attached to the block.')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'The image could not be stored.', 'error')
    }
  }, [storeImage, onNotify])

  const uploadRegistryImage = useCallback(async (file: File) => {
    try {
      const asset = await storeImage(file)
      setHistory((previous) => {
        if (!previous) return previous
        versionRef.current += 1
        return {
          present: touchDocument({
            ...previous.present,
            assets: [...previous.present.assets, asset],
          }),
          past: [...previous.past, previous.present].slice(-80),
          future: [],
        }
      })
      setDirty(true)
      setSaveState('dirty')
      onNotify('Image added to the media registry.')
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'The image could not be stored.', 'error')
    }
  }, [storeImage, onNotify])

  const insertAsset = useCallback((assetId: string) => {
    if (!history) return
    const asset = history.present.assets.find((candidate) => candidate.id === assetId)
    if (!asset) return
    const block = {
      ...createBlock('image'),
      assetId: asset.id,
      alt: asset.alt,
      caption: asset.caption,
      attribution: asset.attribution,
      status: asset.storageKey ? 'local' as const : 'remote' as const,
      url: asset.originalUrl,
    }
    const selectedIndex = selectedBlockId
      ? history.present.blocks.findIndex((candidate) => candidate.id === selectedBlockId)
      : -1
    applyDocument((document) => insertBlock(document, block, selectedIndex + 1))
    setSelectedBlockId(block.id)
    setInspectorTab('block')
  }, [history, selectedBlockId, applyDocument])

  const downloadOriginal = useCallback(async (record: ImportRecord) => {
    if (!record.blobKey) return
    try {
      const original = await getImportOriginal(record.blobKey)
      if (!original) {
        onNotify('The original import is no longer in local storage.', 'error')
        return
      }
      downloadBlob(original.blob, downloadNameForImport(record.fileName, record.format))
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'The original import could not be downloaded.', 'error')
    }
  }, [onNotify])

  const openImportWithFile = (file: File | null) => {
    if (file && !formatFromFileName(file.name)) {
      onNotify('Use Markdown, HTML, TXT, DOCX or a text-based PDF.', 'error')
      return
    }
    setImportFile(file)
    setImportOpen(true)
  }

  const handleImportCommit = async (preview: ImportPreview, target: 'new' | 'append') => {
    if (!history) return
    if (target === 'new') {
      const document = await documentFromImport(preview)
      await saveDocument(document)
      setImportOpen(false)
      onNotify('New project created from the import.')
      onOpenProject(document.id)
      return
    }
    const next = await appendImport(history.present, preview)
    await saveDocument(next)
    versionRef.current += 1
    setHistory({
      present: next,
      past: [...history.past, history.present].slice(-80),
      future: [],
    })
    setDirty(false)
    setSaveState('saved')
    setImportOpen(false)
    setSelectedBlockId(preview.blocks[0]?.id ?? selectedBlockId)
    onNotify(`Appended ${preview.blocks.length} blocks and ${preview.sources.length} sources.`)
  }

  const handleDragEnter = (event: React.DragEvent) => {
    if (importOpen || !Array.from(event.dataTransfer.types).includes('Files')) return
    dragDepth.current += 1
    setDragActive(true)
  }

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragActive(false)
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragActive(false)
    if (importOpen) return
    const file = event.dataTransfer.files[0]
    if (file) openImportWithFile(file)
  }

  if (loading) {
    return (
      <div className="editor-loading">
        <div className="progress-line" />
        <p>Opening project from local storage…</p>
      </div>
    )
  }

  if (loadError || !history) {
    return (
      <div className="editor-loading">
        <p className="eyebrow">Project unavailable</p>
        <h2>{loadError || 'This project could not be loaded.'}</h2>
        <button type="button" className="button primary" onClick={onBack}>Back to projects</button>
      </div>
    )
  }

  const studioDocument = history.present
  const selectedBlock = studioDocument.blocks.find((block) => block.id === selectedBlockId) ?? null
  const saveLabel =
    saveState === 'saving' ? 'Saving…' :
    saveState === 'dirty' ? 'Unsaved changes' :
    saveState === 'error' ? 'Save failed' :
    'Saved locally'

  return (
    <div
      className="editor-shell"
      onDragEnter={handleDragEnter}
      onDragOver={(event) => {
        if (!importOpen && Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
      }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="topbar">
        <div className="topbar-left">
          <button type="button" className="icon-button" onClick={async () => {
            const saved = await saveNow()
            if (saved) onBack()
          }} aria-label="Back to projects" title="Back to projects">←</button>
          <div className="title-edit">
            <span className="eyebrow">Local project</span>
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
                if (event.key === 'Escape') {
                  setTitleDraft(studioDocument.title)
                  event.currentTarget.blur()
                }
              }}
              aria-label="Document title"
              maxLength={160}
            />
          </div>
        </div>
        <div className="topbar-actions">
          <span className={`save-state ${saveState}`} title={saveError || saveLabel}>
            <span className="save-dot" aria-hidden="true" />
            {saveLabel}
          </span>
          <div className="button-row">
            <button type="button" className="icon-button mobile-panel-button" onClick={() => setLeftOpen((open) => !open)} aria-label="Toggle outline">Outline</button>
            <button type="button" className="icon-button" onClick={undo} disabled={history.past.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
            <button type="button" className="icon-button" onClick={redo} disabled={history.future.length === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
            <button type="button" className="button secondary compact" onClick={() => setPrintOpen(true)}>Print preview</button>
            <button type="button" className="button secondary compact" onClick={() => setImportOpen(true)}>Import</button>
            <button type="button" className="button primary compact" onClick={() => setExportOpen(true)}>Export</button>
            <button type="button" className="icon-button mobile-panel-button" onClick={() => setRightOpen((open) => !open)} aria-label="Toggle inspector">Inspector</button>
          </div>
        </div>
      </header>

      <div className="workspace">
        <aside className={`outline-panel ${leftOpen ? 'open' : ''}`} aria-label="Outline and insert">
          <div className="panel-heading">
            <p className="eyebrow">Structure</p>
            <button type="button" className="icon-button close-panel" onClick={() => setLeftOpen(false)} aria-label="Close outline">×</button>
          </div>
          <nav className="outline-list" aria-label="Document outline">
            {outline.length === 0 ? (
              <p className="muted small">Headings you add will form the outline. Select any heading to jump to it.</p>
            ) : (
              outline.map((heading, index) => (
                <button
                  key={heading.id}
                  type="button"
                  className={`outline-item level-${heading.level}`}
                  onClick={() => {
                    setSelectedBlockId(heading.id)
                    setLeftOpen(false)
                    document.getElementById(`block-${heading.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                >
                  <span className="outline-number">{String(index + 1).padStart(2, '0')}</span>
                  <span><InlineContent html={heading.html} /></span>
                </button>
              ))
            )}
          </nav>
          <div className="panel-divider" />
          <p className="eyebrow">Insert block</p>
          <div className="block-palette">
            {INSERTABLE.map((type) => (
              <button key={type} type="button" onClick={() => addBlock(type)} title={BLOCK_HINTS[type]}>
                <span className={`palette-mark palette-${type}`} aria-hidden="true" />
                <span>{BLOCK_TYPE_LABELS[type]}</span>
              </button>
            ))}
          </div>
          <div className="panel-divider" />
          <div className="panel-stats">
            <span><strong>{stats?.words.toLocaleString()}</strong> words</span>
            <span><strong>{stats?.blocks}</strong> blocks</span>
            <span><strong>{studioDocument.sources.length}</strong> sources</span>
            <span><strong>{stats?.images}</strong> images</span>
          </div>
          <p className="muted small updated-note">Edited {relativeDate(studioDocument.updatedAt)}</p>
        </aside>

        <main className="editor-canvas" id="editor-canvas" tabIndex={-1}>
          <div className="canvas-toolbar">
            <div>
              <p className="eyebrow">Draft</p>
              <p className="muted small">{sizeLabel(studioDocument)} · autosaves after a short pause</p>
            </div>
            <div className="canvas-toolbar-actions">
              <span className="muted small">{stats?.words.toLocaleString()} words</span>
              <button type="button" className="text-button" onClick={() => void saveNow()} disabled={saveState === 'saving'}>
                Save now
              </button>
            </div>
          </div>

          <div className="blocks">
            {studioDocument.blocks.length === 0 ? (
              <section className="empty-document">
                <p className="eyebrow">Empty document</p>
                <h2>Start with a heading, or bring in source material.</h2>
                <p>Imports keep their original files, links, citations and images. You can edit every block and still download the untouched original later.</p>
                <div className="button-row">
                  <button type="button" className="button primary" onClick={() => setImportOpen(true)}>Import research</button>
                  <button type="button" className="button secondary" onClick={() => addBlock('heading')}>Add heading</button>
                </div>
              </section>
            ) : (
              studioDocument.blocks.map((block, index) => (
                <EditableBlock
                  key={block.id}
                  block={block}
                  document={studioDocument}
                  selected={block.id === selectedBlockId}
                  index={index}
                  count={studioDocument.blocks.length}
                  onSelect={() => setSelectedBlockId(block.id)}
                  onUpdate={handleBlockChange}
                  onMove={(delta) => applyDocument((document) => moveBlockBy(document, block.id, delta))}
                  onDuplicate={() => applyDocument((document) => duplicateBlock(document, block.id))}
                  onDelete={() => handleDelete(block.id)}
                  onAddAfter={() => {
                    const next = createBlock('paragraph')
                    applyDocument((document) => insertBlock(document, next, index + 1))
                    setSelectedBlockId(next.id)
                  }}
                  onUploadImage={(file) => void uploadBlockImage(block.id, file)}
                />
              ))
            )}
          </div>

          <div className="add-bar" aria-label="Add block">
            <span className="muted small">Add</span>
            {(['heading', 'paragraph', 'list', 'table', 'image', 'quote', 'callout', 'divider'] as BlockType[]).map((type) => (
              <button key={type} type="button" className="add-bar-button" onClick={() => addBlock(type)}>
                + {BLOCK_TYPE_LABELS[type]}
              </button>
            ))}
            {selectedBlock ? <span className="muted small add-bar-hint">after selected block</span> : null}
          </div>
        </main>

        <div className={`inspector-wrap ${rightOpen ? 'open' : ''}`}>
          <div className="panel-heading inspector-mobile-heading">
            <p className="eyebrow">Inspector</p>
            <button type="button" className="icon-button close-panel" onClick={() => setRightOpen(false)} aria-label="Close inspector">×</button>
          </div>
          <Inspector
            document={studioDocument}
            selectedBlockId={selectedBlockId}
            tab={inspectorTab}
            onTab={setInspectorTab}
            onDocumentChange={(next) => applyDocument(() => next)}
            onBlockChange={handleBlockChange}
            onSelectBlock={(id) => {
              setSelectedBlockId(id)
              setInspectorTab('block')
            }}
            onDownloadImport={(record) => void downloadOriginal(record)}
            onOpenImport={() => {
              setImportFile(null)
              setImportOpen(true)
            }}
            onUploadImage={uploadBlockImage}
            onUploadRegistryImage={uploadRegistryImage}
            onInsertAsset={insertAsset}
            onNotify={onNotify}
          />
        </div>
      </div>

      {dragActive ? (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <span className="drop-mark">↓</span>
            <strong>Drop to import research</strong>
            <span>Markdown, HTML, TXT, DOCX or text-based PDF</span>
          </div>
        </div>
      ) : null}

      <ImportDialog
        open={importOpen}
        initialFile={importFile}
        allowAppend
        onClose={() => {
          setImportOpen(false)
          setImportFile(null)
        }}
        onCommit={handleImportCommit}
      />
      <ExportDialog
        open={exportOpen}
        document={studioDocument}
        onClose={() => setExportOpen(false)}
        onNotify={onNotify}
      />
      <PrintPreview open={printOpen} document={studioDocument} onClose={() => setPrintOpen(false)} />
    </div>
  )
}

function sizeLabel(studioDocument: StudioDocument): string {
  return `${studioDocument.exportSettings.pageSize.toUpperCase()} · ${studioDocument.exportSettings.theme} theme`
}
