import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImportPreview } from '../import'
import { createDocument } from '../model/factory'
import {
  deleteProject,
  duplicateProject,
  getStorageEstimate,
  listProjects,
  saveDocument,
  type ProjectSummary,
} from '../storage/repository'
import { documentFromImport } from '../studio/importCommit'
import { ImportDialog } from './ImportDialog'
import { formatBytes, formatDate, relativeDate } from './format'
import { formatFromFileName } from '../import/types'

interface DashboardProps {
  onOpenProject: (projectId: string) => void
  onNotify: (message: string, tone?: 'info' | 'error') => void
}

export function Dashboard({ onOpenProject, onNotify }: DashboardProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const dragDepth = useRef(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [list, estimate] = await Promise.all([listProjects(), getStorageEstimate()])
      setProjects(list)
      setStorage(estimate)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Projects could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createBlank = async () => {
    if (creating) return
    setCreating(true)
    try {
      const document = createDocument('Untitled research')
      await saveDocument(document)
      onOpenProject(document.id)
    } catch (caught) {
      onNotify(caught instanceof Error ? caught.message : 'The project could not be created.', 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleImport = async (preview: ImportPreview) => {
    const document = await documentFromImport(preview)
    await saveDocument(document)
    setImportOpen(false)
    setImportFile(null)
    onNotify(`Imported "${document.title}" with ${document.blocks.length} blocks.`)
    onOpenProject(document.id)
  }

  const handleDuplicate = async (project: ProjectSummary) => {
    setBusyId(project.id)
    try {
      await duplicateProject(project.id)
      await refresh()
      onNotify(`Duplicated "${project.title}".`)
    } catch (caught) {
      onNotify(caught instanceof Error ? caught.message : 'The project could not be duplicated.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (project: ProjectSummary) => {
    const ok = window.confirm(`Delete "${project.title}"? This removes the project from this browser. Download any export you need first.`)
    if (!ok) return
    setBusyId(project.id)
    try {
      await deleteProject(project.id)
      await refresh()
      onNotify(`Deleted "${project.title}".`)
    } catch (caught) {
      onNotify(caught instanceof Error ? caught.message : 'The project could not be deleted.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const openWithFile = (file: File) => {
    if (!formatFromFileName(file.name)) {
      onNotify('Use Markdown, HTML, TXT, DOCX or a text-based PDF.', 'error')
      return
    }
    setImportFile(file)
    setImportOpen(true)
  }

  return (
    <div
      className="dashboard"
      onDragEnter={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return
        dragDepth.current += 1
        setDragActive(true)
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragActive(false)
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setDragActive(false)
        const file = event.dataTransfer.files[0]
        if (file) openWithFile(file)
      }}
    >
      <header className="dashboard-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">R</span>
          <div>
            <strong>Research-to-Document Studio</strong>
            <span className="muted small">Local-first writing workspace</span>
          </div>
        </div>
        <div className="local-badge" title="No server, no account, no telemetry">
          <span aria-hidden="true">●</span> Local only
        </div>
      </header>

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Research → editable document</p>
          <h1>Turn source material into a document you can defend.</h1>
          <p className="hero-copy">
            Import research, keep every original and source, shape it block by block, then export a validated PDF or an editable Word file. Everything stays in this browser.
          </p>
          <div className="hero-actions">
            <button type="button" className="button primary large" onClick={() => setImportOpen(true)}>
              Import research
            </button>
            <button type="button" className="button secondary large" onClick={() => void createBlank()} disabled={creating}>
              {creating ? 'Creating…' : 'New blank document'}
            </button>
          </div>
          <p className="hero-formats">MD · HTML · TXT · DOCX · text PDF · paste · drag and drop</p>
        </div>
        <aside className="hero-card">
          <p className="eyebrow">What is preserved</p>
          <ul>
            <li>Untouched original imports, downloadable later</li>
            <li>Source URLs and citation blocks</li>
            <li>Local image files and remote image references</li>
            <li>Extraction warnings shown before import</li>
          </ul>
          <div className="hero-card-footer">
            {storage ? (
              <>
                <span>{formatBytes(storage.usage)} used locally</span>
                <span className="muted small">of {formatBytes(storage.quota)} available</span>
              </>
            ) : (
              <span className="muted small">Storage estimate unavailable in this browser</span>
            )}
          </div>
        </aside>
      </section>

      <section className="projects-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Your projects</h2>
          </div>
          <div className="button-row">
            <button type="button" className="button secondary compact" onClick={() => void refresh()} disabled={loading}>
              Refresh
            </button>
            <button type="button" className="button primary compact" onClick={() => setImportOpen(true)}>Import</button>
          </div>
        </div>

        {loading ? (
          <div className="project-loading">
            <div className="progress-line" />
            <p className="muted">Reading local projects…</p>
          </div>
        ) : error ? (
          <div className="alert error">
            <strong>Local storage could not be read.</strong>
            <p>{error}</p>
            <button type="button" className="button secondary compact" onClick={() => void refresh()}>Try again</button>
          </div>
        ) : projects.length === 0 ? (
          <div className="empty-library">
            <div className="empty-library-mark" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 3.75h9.5L19 7.25v10.5A2.5 2.5 0 0 1 16.5 20.25h-10.5A2.5 2.5 0 0 1 3.5 17.75V6.25A2.5 2.5 0 0 1 6 3.75Z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
                <path d="M15.25 3.9v3.4h3.4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M7.5 12.5h7M7.5 16h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </div>
            <h3>No projects yet</h3>
            <p>Import a document or start blank. Your work is stored in IndexedDB on this device.</p>
            <div className="button-row">
              <button type="button" className="button primary" onClick={() => setImportOpen(true)}>Import research</button>
              <button type="button" className="button secondary" onClick={() => void createBlank()}>Create blank</button>
            </div>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((project) => (
              <article className="project-card" key={project.id}>
                <button type="button" className="project-open" onClick={() => onOpenProject(project.id)}>
                  <span className="project-block-count">{project.blockCount} block{project.blockCount === 1 ? '' : 's'}</span>
                  <h3>{project.title || 'Untitled document'}</h3>
                  <p className="muted small">Edited {relativeDate(project.updatedAt)} · created {formatDate(project.createdAt)}</p>
                </button>
                <div className="project-actions">
                  <button type="button" className="text-button" onClick={() => onOpenProject(project.id)}>Open</button>
                  <button type="button" className="text-button" onClick={() => void handleDuplicate(project)} disabled={busyId === project.id}>Duplicate</button>
                  <button type="button" className="text-button danger" onClick={() => void handleDelete(project)} disabled={busyId === project.id}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="dashboard-footer">
        <span>PDF and DOCX exports are validated from the generated bytes before download.</span>
        <span>Scripts in imported content are never executed.</span>
      </footer>

      {dragActive ? (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <span className="drop-mark">↓</span>
            <strong>Drop to preview an import</strong>
            <span>Markdown, HTML, TXT, DOCX or text-based PDF</span>
          </div>
        </div>
      ) : null}

      <ImportDialog
        open={importOpen}
        initialFile={importFile}
        allowAppend={false}
        onClose={() => {
          setImportOpen(false)
          setImportFile(null)
        }}
        onCommit={handleImport}
      />
    </div>
  )
}
