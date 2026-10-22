import { useEffect, useState } from 'react'
import type { Document as StudioDocument } from '../model/schema'
import { resolveDocumentImages } from '../export/images'
import { exportPdf } from '../export/pdf/exportPdf'
import { exportDocx } from '../export/docx/exportDocx'
import { downloadBlob } from '../export/types'
import type { ExportResult } from '../export/types'
import { formatBytes } from './format'

type ExportFormat = 'pdf' | 'docx'

interface ExportDialogProps {
  open: boolean
  document: StudioDocument
  onClose: () => void
  onNotify: (message: string, tone?: 'info' | 'error') => void
}

export function ExportDialog({ open, document: studioDocument, onClose, onNotify }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [working, setWorking] = useState(false)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setFormat('pdf')
    setResult(null)
    setError('')
    setWorking(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !working) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, working, onClose])

  if (!open) return null

  const generate = async () => {
    if (working) return
    setWorking(true)
    setError('')
    setResult(null)
    try {
      const resolved = await resolveDocumentImages(studioDocument)
      const exported =
        format === 'pdf'
          ? await exportPdf(studioDocument, resolved.byBlockId, resolved.warnings)
          : await exportDocx(studioDocument, resolved.byBlockId, resolved.warnings)
      setResult(exported)
      if (exported.validation.ok) {
        downloadBlob(exported.blob, exported.fileName)
        onNotify(`${format === 'pdf' ? 'PDF' : 'DOCX'} exported and validated.`)
      } else {
        onNotify('Export validation failed. Nothing was downloaded.', 'error')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The export failed.')
      onNotify('Export failed. See the dialog for details.', 'error')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !working) onClose()
      }}
    >
      <section className="modal export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <header className="modal-header">
          <div>
            <p className="eyebrow">Delivery</p>
            <h2 id="export-title">Export document</h2>
          </div>
          <button type="button" className="button secondary" onClick={onClose} disabled={working}>Close</button>
        </header>

        <div className="modal-body">
          <div className="format-choice">
            <label className={format === 'pdf' ? 'format-card selected' : 'format-card'}>
              <input
                type="radio"
                name="export-format"
                checked={format === 'pdf'}
                onChange={() => setFormat('pdf')}
                disabled={working}
              />
              <strong>PDF</strong>
              <span>Paginated, print-ready, links and images embedded. Built-in fonts cover Latin text.</span>
            </label>
            <label className={format === 'docx' ? 'format-card selected' : 'format-card'}>
              <input
                type="radio"
                name="export-format"
                checked={format === 'docx'}
                onChange={() => setFormat('docx')}
                disabled={working}
              />
              <strong>DOCX</strong>
              <span>Editable Word file with native headings, lists, tables, links, and embedded images.</span>
            </label>
          </div>

          <div className="export-facts">
            <span>{studioDocument.blocks.length} blocks</span>
            <span>Theme: {studioDocument.exportSettings.theme}</span>
            <span>Page: {studioDocument.exportSettings.pageSize.toUpperCase()}</span>
            <span>{studioDocument.sources.length} sources</span>
          </div>

          {studioDocument.blocks.length === 0 ? (
            <div className="alert warning">Add content before exporting. Empty documents are blocked by validation.</div>
          ) : null}

          {working ? (
            <div className="export-working" role="status">
              <div className="progress-line" />
              <p>Resolving images, writing the {format.toUpperCase()}, and validating the package…</p>
            </div>
          ) : null}

          {result ? (
            <div className={`export-result ${result.validation.ok ? 'success' : 'failure'}`}>
              <h3>{result.validation.ok ? 'Validated export' : 'Export needs attention'}</h3>
              <p>{result.validation.details}</p>
              <p className="file-meta">{result.fileName} · {formatBytes(result.blob.size)}</p>
              {result.validation.errors.length > 0 ? (
                <div className="alert error">
                  <strong>Errors</strong>
                  <ul>{result.validation.errors.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {result.validation.warnings.length > 0 ? (
                <div className="alert warning">
                  <strong>Warnings</strong>
                  <ul>{result.validation.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {result.validation.ok ? (
                <button type="button" className="button secondary" onClick={() => downloadBlob(result.blob, result.fileName)}>
                  Download again
                </button>
              ) : null}
            </div>
          ) : null}

          {error ? <div className="alert error" role="alert">{error}</div> : null}

          <footer className="modal-actions">
            <p className="export-note">
              Validation reads the generated bytes before download. Browser print is available from the editor for a visual proof.
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => void generate()}
              disabled={working || studioDocument.blocks.length === 0}
            >
              {working ? 'Exporting…' : `Generate and download ${format.toUpperCase()}`}
            </button>
          </footer>
        </div>
      </section>
    </div>
  )
}
