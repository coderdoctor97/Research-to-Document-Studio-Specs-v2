import { describe, expect, it } from 'vitest'
import {
  extractLinksFromHtml,
  inlineHtmlIsEmpty,
  inlineHtmlToPlainText,
  parseInlineRuns,
  sanitizeInlineHtml,
} from '../src/model/inline'

describe('inline content', () => {
  it('removes scripts, images, styles and event handlers from inline HTML', () => {
    const clean = sanitizeInlineHtml(
      '<p onclick="alert(1)">Hello <script>alert(2)</script><img src=x onerror=alert(3)><strong>world</strong></p>',
    )
    expect(clean).not.toMatch(/script|onclick|onerror|img/i)
    expect(clean).toContain('<strong>world</strong>')
  })

  it('removes javascript links but keeps their label text', () => {
    const clean = sanitizeInlineHtml('<a href="javascript:alert(1)">Click</a>')
    expect(clean).not.toContain('javascript')
    expect(clean).toContain('Click')
  })

  it('parses allowed inline formatting into runs', () => {
    const runs = parseInlineRuns(
      'A <strong>bold</strong> and <em>italic</em> <code>code</code> <a href="https://example.com">link</a><br>next',
    )
    expect(runs.map((run) => run.text).join('')).toBe('A bold and italic code link\nnext')
    expect(runs.find((run) => run.text === 'bold')?.bold).toBe(true)
    expect(runs.find((run) => run.text === 'italic')?.italic).toBe(true)
    expect(runs.find((run) => run.text === 'code')?.code).toBe(true)
    expect(runs.find((run) => run.text === 'link')?.href).toBe('https://example.com')
  })

  it('decodes entities and drops unsafe hrefs', () => {
    const html = sanitizeInlineHtml('<a href="https://example.com?a=1&amp;b=2">A &amp; B</a>')
    expect(inlineHtmlToPlainText(html)).toBe('A & B')
    const runs = parseInlineRuns('<a href="javascript:alert(1)">bad</a>')
    expect(runs[0].href).toBeUndefined()
  })

  it('deduplicates extracted links by URL', () => {
    const links = extractLinksFromHtml(
      '<a href="https://example.com">One</a> <a href="https://example.com">Two</a> <a href="https://other.test">Other</a>',
    )
    expect(links).toHaveLength(2)
    expect(links[0].label).toBe('One')
  })

  it('detects empty inline content', () => {
    expect(inlineHtmlIsEmpty('<br>')).toBe(true)
    expect(inlineHtmlIsEmpty('  <br> ')).toBe(true)
    expect(inlineHtmlIsEmpty('<strong>text</strong>')).toBe(false)
  })
})
