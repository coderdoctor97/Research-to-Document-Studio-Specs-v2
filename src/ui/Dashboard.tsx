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
      setError(caught instanceof Error ? caught.message : 'Something went wrong reading local storage.')
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
      onNotify(caught instanceof Error ? caught.message : "Couldn't create the project. Try again.", 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleImport = async (preview: ImportPreview) => {
    const document = await documentFromImport(preview)
    await saveDocument(document)
    setImportOpen(false)
    setImportFile(null)
    onNotify(`Imported "${document.title}" — ${document.blocks.length} block${document.blocks.length === 1 ? '' : 's'} ready to edit.`)
    onOpenProject(document.id)
  }

  const handleDuplicate = async (project: ProjectSummary) => {
    setBusyId(project.id)
    try {
      await duplicateProject(project.id)
      await refresh()
      onNotify(`Duplicated as "${project.title} copy".`)
    } catch (caught) {
      onNotify(caught instanceof Error ? caught.message : "Couldn't duplicate the project. Try again.", 'error')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (project: ProjectSummary) => {
    const ok = window.confirm(`"${project.title}" will be removed from this browser and can't be recovered. Export a copy first if you still need it.\n\nDelete this project?`)
    if (!ok) return
    setBusyId(project.id)
    try {
      await deleteProject(project.id)
      await refresh()
      onNotify(`Deleted "${project.title}".`)
    } catch (caught) {
      onNotify(caught instanceof Error ? caught.message : "Couldn't delete the project. Try again.", 'error')
    } finally {
      setBusyId(null)
    }
  }

  const openWithFile = (file: File) => {
    if (!formatFromFileName(file.name)) {
      onNotify("That file type can't be imported. Use Markdown, HTML, TXT, DOCX or a text-based PDF.", 'error')
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
            <span className="muted small">Documents that never leave your device</span>
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
            Keep every original, source link and image attached while you shape your research block by block — then download a checked PDF or an editable Word file. Nothing leaves this browser.
          </p>
          <div className="hero-actions">
            <button type="button" className="button primary large" onClick={() => setImportOpen(true)}>
              Import research
            </button>
            <button type="button" className="button secondary large" onClick={() => void createBlank()} disabled={creating}>
              {creating ? 'Starting your document…' : 'New blank document'}
            </button>
          </div>
          <p className="hero-formats">Works with MD · HTML · TXT · DOCX · text-based PDF — or just paste, or drop a file anywhere</p>
        </div>
        <aside className="hero-card">
          <p className="eyebrow">What you never lose</p>
          <ul>
            <li>Your original files, untouched and downloadable anytime</li>
            <li>Every source link and citation, kept with the text it supports</li>
            <li>Images saved on this device, plus links to remote ones</li>
            <li>A chance to check warnings before anything is imported</li>
          </ul>
          <div className="hero-card-footer">
            {storage ? (
              <>
                <span>{formatBytes(storage.usage)} used on this device</span>
                <span className="muted small">of {formatBytes(storage.quota)} your browser allows</span>
              </>
            ) : (
              <span className="muted small">This browser doesn't report free local storage</span>
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
            <strong>Couldn't load your projects.</strong>
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
            <p>Import research to turn it into an editable, source-backed document, or start from a blank page. Everything is saved only on this device.</p>
            <div className="button-row">
              <button type="button" className="button primary" onClick={() => setImportOpen(true)}>Import research</button>
              <button type="button" className="button secondary" onClick={() => void createBlank()}>New blank document</button>
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
        <span>Every PDF and Word export is checked before it downloads — an invalid file never reaches you.</span>
        <span>Imported scripts are stripped out and never run.</span>
      </footer>

      {dragActive ? (
        <div className="drop-overlay" aria-hidden="true">
          <div>
            <span className="drop-mark">↓</span>
            <strong>Drop to see what will import</strong>
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
