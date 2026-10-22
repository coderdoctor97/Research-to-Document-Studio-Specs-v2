import { useEffect, useRef } from 'react'
import { escapeHtml, parseInlineRuns, sanitizeInlineHtml } from '../model/inline'

export function InlineContent({ html }: { html: string }) {
  const runs = parseInlineRuns(html)
  return (
    <>
      {runs.map((run, runIndex) => {
        const pieces = run.text.split('\n')
        const content = pieces.map((piece, pieceIndex) => (
          <span key={`${runIndex}-${pieceIndex}`}>
            {piece}
            {pieceIndex < pieces.length - 1 ? <br /> : null}
          </span>
        ))
        const key = `${runIndex}-${run.text.slice(0, 12)}`
        const styled = run.code ? <code key={key}>{content}</code> : content
        if (run.href) {
          return (
            <a key={key} href={run.href} target="_blank" rel="noreferrer noopener">
              {run.bold ? <strong>{styled}</strong> : styled}
            </a>
          )
        }
        if (run.bold && run.italic) {
          return (
            <strong key={key}>
              <em>{styled}</em>
            </strong>
          )
        }
        if (run.bold) return <strong key={key}>{styled}</strong>
        if (run.italic) return <em key={key}>{styled}</em>
        return <span key={key}>{styled}</span>
      })}
    </>
  )
}

interface InlineEditableProps {
  html: string
  onCommit: (html: string) => void
  className?: string
  placeholder?: string
  ariaLabel?: string
  singleLine?: boolean
}

/**
 * Editing surface for the stored inline-HTML subset. It never accepts raw
 * pasted markup, and everything is sanitized again before it reaches the model.
 */
export function InlineEditable({
  html,
  onCommit,
  className = '',
  placeholder = '',
  ariaLabel,
  singleLine = false,
}: InlineEditableProps) {
  const ref = useRef<HTMLDivElement>(null)
  const safeHtml = sanitizeInlineHtml(html)
  const latest = useRef({ safeHtml, onCommit })
  latest.current = { safeHtml, onCommit }
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || document.activeElement === node) return
    if (node.innerHTML !== safeHtml) node.innerHTML = safeHtml
  }, [safeHtml])

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
  }, [])

  const readClean = () => (ref.current ? sanitizeInlineHtml(ref.current.innerHTML) : latest.current.safeHtml)

  const commit = (resetMarkup: boolean) => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const node = ref.current
    if (!node) return
    const clean = readClean()
    if (resetMarkup) node.innerHTML = clean
    if (clean !== latest.current.safeHtml) {
      latest.current.safeHtml = clean
      latest.current.onCommit(clean)
    }
  }

  const scheduleCommit = () => {
    if (timer.current !== null) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      const clean = readClean()
      if (clean !== latest.current.safeHtml) {
        latest.current.safeHtml = clean
        latest.current.onCommit(clean)
      }
    }, 600)
  }

  const insertText = (text: string) => {
    const normalized = singleLine ? text.replace(/\s+/g, ' ') : text
    const markup = normalized
      .split(/\r?\n/)
      .map((line) => escapeHtml(line))
      .join('<br>')
    if (markup) document.execCommand('insertHTML', false, markup)
  }

  return (
    <div
      ref={ref}
      className={`inline-editable ${className}`.trim()}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={!singleLine}
      data-placeholder={placeholder}
      spellCheck
      onInput={scheduleCommit}
      onBlur={() => commit(true)}
      onPaste={(event) => {
        const text = event.clipboardData.getData('text/plain')
        event.preventDefault()
        insertText(text)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          event.preventDefault()
          ref.current?.blur()
          return
        }
        if (event.key === 'Enter' && singleLine) {
          event.preventDefault()
          ref.current?.blur()
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          document.execCommand('insertLineBreak')
        }
      }}
    />
  )
}
