import { useCallback, useEffect, useState } from 'react'
import { Dashboard } from './ui/Dashboard'
import { Editor } from './ui/Editor'

type View = { kind: 'dashboard' } | { kind: 'editor'; projectId: string }

interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

let toastCounter = 0

export function App() {
  const [view, setView] = useState<View>({ kind: 'dashboard' })
  const [toasts, setToasts] = useState<Toast[]>([])

  const notify = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    toastCounter += 1
    setToasts((current) => [...current.slice(-2), { id: toastCounter, message, tone }])
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const timer = window.setTimeout(() => {
      setToasts((current) => (current.length > 0 ? current.slice(1) : current))
    }, 5000)
    return () => window.clearTimeout(timer)
  }, [toasts])

  return (
    <>
      {view.kind === 'editor' ? (
        <a className="skip-link" href="#editor-canvas">
          Skip to document
        </a>
      ) : null}
      {view.kind === 'dashboard' ? (
        <Dashboard
          onOpenProject={(projectId) => setView({ kind: 'editor', projectId })}
          onNotify={notify}
        />
      ) : (
        <Editor
          key={view.projectId}
          projectId={view.projectId}
          onBack={() => setView({ kind: 'dashboard' })}
          onOpenProject={(projectId) => setView({ kind: 'editor', projectId })}
          onNotify={notify}
        />
      )}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
