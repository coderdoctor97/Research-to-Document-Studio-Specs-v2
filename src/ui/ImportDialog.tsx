import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ImportError,
  MAX_IMPORT_BYTES,
  SUPPORTED_EXTENSIONS,
  importFile,
  importPaste,
  type ImportPreview,
  type PasteMode,
} from '../import'
import { formatFromFileName } from '../import/types'
import { inlineHtmlToPlainText } from '../model/inline'
import { formatBytes } from './format'

interface ImportDialogProps {
  open: boolean
  initialFile?: File | null
  allowAppend: boolean
  onClose: () => void
  onCommit: (preview: ImportPreview, target: 'new' | 'append') => Promise<void>
}

type SourceMode = 'file' | 'paste'

function blockSample(preview: ImportPreview): Array<{ key: string; type: string; text: string }> {
  return preview.blocks.slice(0, 10).map((block) => {
    let text = ''
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'callout':
      case 'quote':
        text = inlineHtmlToPlainText(block.html)
        break
      case 'list':
        text = block.items.map((item) => inlineHtmlToPlainText(item.html)).join(' · ')
        break
      case 'table':
        text = block.rows.map((row) => row.join(' | ')).join(' · ')
        break
      case 'image':
        text = block.alt || block.caption || block.url || '(image)'
        break
      case 'video':
        text = block.title || block.url
        break
      case 'citation':
        text = [block.label, block.quote].filter(Boolean).join(' — ')
        break
      case 'divider':
        text = '(divider)'
        break
    }
    return { key: block.id, type: block.type, text: text.slice(0, 220) }
  })
}

export function ImportDialog({
  open,
  initialFile,
  allowAppend,
  onClose,
  onCommit,
}: ImportDialogProps) {
  const [sourceMode, setSourceMode] = useState<SourceMode>('file')
  const [pasteMode, setPasteMode] = useState<PasteMode>('markdown')
  const [pasteText, setPasteText] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewTitle, setPreviewTitle] = useState('')
  const [target, setTarget] = useState<'new' | 'append'>(allowAppend ? 'append' : 'new')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const requestRef = useRef(0)

  const runFile = useCallback(async (file: File) => {
    const request = requestRef.current + 1
    requestRef.current = request
    setFileName(file.name)
    setError('')
    setPreview(null)
    setBusy(true)
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new ImportError(
          `This file is ${formatBytes(file.size)} — over the ${formatBytes(MAX_IMPORT_BYTES)} limit. Split it, or paste just the section you need.`,
        )
      }
      if (!formatFromFileName(file.name)) {
        throw new ImportError(
          `That file type can't be imported. Use ${SUPPORTED_EXTENSIONS.map((extension) => `.${extension}`).join(', ')}.`,
        )
      }
      const result = await importFile(file)
      if (requestRef.current !== request) return
      setPreview(result)
      setPreviewTitle(result.title)
    } catch (caught) {
      if (requestRef.current !== request) return
      setError(caught instanceof Error ? caught.message : "Couldn't read that file. Check it opens elsewhere, then try again.")
    } finally {
      if (requestRef.current === request) setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setSourceMode(initialFile ? 'file' : 'file')
    setPasteText('')
    setPreview(null)
    setPreviewTitle('')
    setFileName('')
    setError('')
    setBusy(false)
    setDragging(false)
    setTarget(allowAppend ? 'append' : 'new')
    requestRef.current += 1
    if (initialFile) void runFile(initialFile)
  }, [open, initialFile, allowAppend, runFile])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onClose])

  if (!open) return null

  const previewPaste = () => {
    setError('')
    try {
      const result = importPaste(pasteMode, pasteText)
      setPreview(result)
      setPreviewTitle(result.title)
      setFileName('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't read that pasted content. Try a different format above — Markdown, HTML or plain text.")
    }
  }

  const confirm = async () => {
    if (!preview || busy) return
    setBusy(true)
    setError('')
    try {
      await onCommit({ ...preview, title: previewTitle.trim() || preview.title }, target)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save the import. Your preview is still here — try again.")
      setBusy(false)
    }
  }

  const reset = () => {
    setPreview(null)
    setPreviewTitle('')
    setFileName('')
    setPasteText('')
    setError('')
    setSourceMode('file')
    requestRef.current += 1
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose()
    }}>
      <section className="modal import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Nothing is added until you confirm</p>
            <h2 id="import-title">Import research</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Close import dialog">
            ×
          </button>
        </header>

        {!preview ? (
          <div className="modal-body">
            <div className="source-tabs" role="tablist" aria-label="Import source">
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === 'file'}
                className={sourceMode === 'file' ? 'active' : ''}
                onClick={() => setSourceMode('file')}
              >
                Upload or drop a file
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === 'paste'}
                className={sourceMode === 'paste' ? 'active' : ''}
                onClick={() => setSourceMode('paste')}
              >
                Paste text
              </button>
            </div>

            {sourceMode === 'file' ? (
              <div
                className={`drop-zone ${dragging ? 'dragging' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragging(false)
                  const file = event.dataTransfer.files[0]
                  if (file) void runFile(file)
                }}
              >
                <span className="drop-mark" aria-hidden="true">↓</span>
                <p><strong>Drop a research file here</strong></p>
                <p className="muted">
                  Markdown, HTML, TXT, DOCX or text-based PDF · up to {formatBytes(MAX_IMPORT_BYTES)}
                </p>
                <label className="button secondary file-picker">
                  Choose a file to preview
                  <input
                    type="file"
                    accept=".md,.markdown,.html,.htm,.txt,.docx,.pdf,text/markdown,text/html,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) void runFile(file)
                      event.target.value = ''
                    }}
                  />
                </label>
                {fileName ? <p className="file-note">Reading {fileName}…</p> : null}
                {busy ? <div className="progress-line" aria-label="Extracting content" /> : null}
              </div>
            ) : (
              <div className="paste-panel">
                <div className="segmented" role="group" aria-label="Pasted content format">
                  {(['markdown', 'html', 'text'] as PasteMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={pasteMode === mode ? 'active' : ''}
                      onClick={() => setPasteMode(mode)}
                    >
                      {mode === 'text' ? 'Plain text' : mode === 'html' ? 'HTML' : 'Markdown'}
                    </button>
                  ))}
                </div>
                <textarea
                  className="paste-area"
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder="Paste notes, an article, a transcript, or a table. Content is extracted locally in your browser."
                  rows={12}
                />
                <button type="button" className="button primary" onClick={previewPaste} disabled={!pasteText.trim()}>
                  Preview what will import
                </button>
              </div>
            )}

            <p className="security-note">
              Nothing leaves this browser: scripts are stripped out and never run, and your untouched original is kept with the import for later download.
            </p>
            {error ? <div className="alert error" role="alert">{error}</div> : null}
          </div>
        ) : (
          <div className="modal-body">
            <div className="preview-heading">
              <div>
                <p className="eyebrow">Import preview · check what was found</p>
                <h3>{preview.original.fileName || (preview.format === 'paste' ? 'Pasted content' : 'Imported source')}</h3>
              </div>
              <button type="button" className="text-button" onClick={reset} disabled={busy}>
                Choose another source
              </button>
            </div>

            <label className="field">
              <span>Document title</span>
              <input value={previewTitle} onChange={(event) => setPreviewTitle(event.target.value)} />
            </label>

            <div className="stat-row">
              <span><strong>{preview.stats.blocks}</strong> blocks</span>
              <span><strong>{preview.stats.words.toLocaleString()}</strong> words</span>
              <span><strong>{preview.stats.images}</strong> images</span>
              <span><strong>{preview.stats.links}</strong> links</span>
              <span><strong>{preview.sources.length}</strong> sources</span>
            </div>

            {preview.warnings.length > 0 ? (
              <div className="warning-list" aria-label="Import warnings">
                {preview.warnings.map((warning, index) => (
                  <p key={`${warning.code}-${index}`} className={`warning ${warning.severity}`}>
                    <span aria-hidden="true">{warning.severity === 'warning' ? '!' : 'i'}</span>
                    {warning.message}
                  </p>
                ))}
              </div>
            ) : (
              <p className="notice">No warnings. Skim the sample below, then import.</p>
            )}

            <div className="block-sample">
              {blockSample(preview).map((sample) => (
                <div key={sample.key} className="sample-row">
                  <span className="sample-type">{sample.type}</span>
                  <span className="sample-text">{sample.text || '(empty block)'}</span>
                </div>
              ))}
              {preview.blocks.length > 10 ? (
                <p className="muted">…and {preview.blocks.length - 10} more blocks you'll see after importing.</p>
              ) : null}
            </div>

            <fieldset className="target-choice">
              <legend>Where should this go?</legend>
              {allowAppend ? (
                <label>
                  <input
                    type="radio"
                    name="import-target"
                    checked={target === 'append'}
                    onChange={() => setTarget('append')}
                  />
                  Add to the end of this document
                </label>
              ) : null}
              <label>
                <input
                  type="radio"
                  name="import-target"
                  checked={target === 'new'}
                  onChange={() => setTarget('new')}
                />
                Create a new project
              </label>
            </fieldset>

            <p className="security-note">
              The untouched original, the blocks above, images and source links are all saved on this device. Nothing is sent anywhere.
            </p>
            {error ? <div className="alert error" role="alert">{error}</div> : null}

            <footer className="modal-actions">
              <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="button primary" onClick={() => void confirm()} disabled={busy}>
                {busy ? 'Saving import…' : target === 'append' ? 'Add to this document' : 'Create new project'}
              </button>
            </footer>
          </div>
        )}
      </section>
    </div>
  )
}
