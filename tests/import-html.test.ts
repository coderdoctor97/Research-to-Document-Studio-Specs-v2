import { describe, expect, it } from 'vitest'
import { importHtml } from '../src/import/html'
import { importMarkdown } from '../src/import/markdown'
import { importText } from '../src/import/text'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

const original = { kind: 'paste' as const, text: '' }

describe('HTML import', () => {
  it('normalizes supported blocks, media, links, and provenance', () => {
    const preview = importHtml({
      html: `
        <html><head><title>Page title</title><script>alert(1)</script></head>
        <body>
          <h1>Research title</h1>
          <p>Intro with <a href="https://example.com/source">a source</a>.</p>
          <h2>Details</h2>
          <ul>
            <li>One <strong>bold</strong></li>
            <li>Two
              <ul><li>Nested <a href="https://nested.example/page">link</a></li></ul>
            </li>
          </ul>
          <table>
            <thead><tr><th>Name</th><th>Value</th></tr></thead>
            <tbody><tr><td>A</td><td>1</td></tr></tbody>
          </table>
          <figure>
            <img src="https://cdn.example.com/image.png" alt="Chart" width="300" height="200">
            <figcaption>Figure one</figcaption>
          </figure>
          <blockquote><p>Quoted text.</p><cite>Author Name</cite></blockquote>
          <iframe src="https://www.youtube.com/embed/abc123" title="A talk"></iframe>
          <pre><code>const answer = 42</code></pre>
          <hr>
          <p><a href="javascript:alert(1)">bad link</a></p>
        </body></html>`,
      original,
    })

    expect(preview.title).toBe('Research title')
    expect(preview.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'list',
      'table',
      'image',
      'quote',
      'video',
      'paragraph',
      'divider',
      'paragraph',
    ])

    const list = preview.blocks[3]
    expect(list.type).toBe('list')
    if (list.type === 'list') {
      expect(list.items).toHaveLength(3)
      expect(list.items.map((item) => item.depth)).toEqual([0, 0, 1])
      expect(list.items[0].html).toContain('<strong>bold</strong>')
    }

    const table = preview.blocks[4]
    expect(table.type).toBe('table')
    if (table.type === 'table') {
      expect(table.header).toBe(true)
      expect(table.rows[0]).toEqual(['Name', 'Value'])
    }

    const image = preview.blocks[5]
    expect(image.type).toBe('image')
    if (image.type === 'image') {
      expect(image.assetId).toBeTruthy()
      expect(image.status).toBe('remote')
      expect(image.caption).toBe('Figure one')
      expect(image.alt).toBe('Chart')
    }
    expect(preview.assets[0]).toMatchObject({
      originalUrl: 'https://cdn.example.com/image.png',
      status: 'remote',
      width: 300,
      height: 200,
    })

    const quote = preview.blocks[6]
    expect(quote.type).toBe('quote')
    if (quote.type === 'quote') {
      expect(quote.html).toContain('Quoted text.')
      expect(quote.attribution).toBe('Author Name')
    }

    expect(preview.blocks[8]).toMatchObject({ type: 'paragraph', metadata: { format: 'code' } })
    expect(preview.sources.map((source) => source.url)).toContain('https://example.com/source')
    expect(preview.sources.map((source) => source.url)).toContain('https://nested.example/page')
    expect(preview.warnings.some((warning) => warning.code === 'scripts-removed')).toBe(true)
    expect(preview.warnings.some((warning) => warning.code === 'unsafe-link')).toBe(true)
    expect(preview.stats.images).toBe(1)
    expect(preview.stats.blocks).toBe(preview.blocks.length)
  })

  it('stores data-URL images as local blobs and keeps relative images unresolved', () => {
    const preview = importHtml({
      html: `
        <p><img src="data:image/png;base64,${PNG_BASE64}" alt="Local"></p>
        <p><img src="/relative/image.png" alt="Relative"></p>`,
      original,
    })

    const [local, relative] = preview.blocks.filter((block) => block.type === 'image')
    expect(local).toMatchObject({ type: 'image', status: 'local', alt: 'Local' })
    expect(relative).toMatchObject({ type: 'image', status: 'unresolved' })
    if (local.type === 'image' && local.assetId) {
      expect(preview.assetBlobs[local.assetId]).toBeInstanceOf(Blob)
      expect(preview.assetBlobs[local.assetId].size).toBeGreaterThan(0)
      expect(preview.assets.find((asset) => asset.id === local.assetId)?.status).toBe('local')
    }
    expect(preview.warnings.some((warning) => warning.code === 'image-relative-url')).toBe(true)
  })

  it('flattens merged table cells with a warning instead of dropping them', () => {
    const preview = importHtml({
      html: '<table><tr><th colspan="2">Merged</th></tr><tr><td>A</td><td>B</td></tr></table>',
      original,
    })
    expect(preview.blocks[0].type).toBe('table')
    expect(preview.warnings.some((warning) => warning.code === 'table-spans')).toBe(true)
  })

  it('rejects HTML with no readable content', () => {
    expect(() =>
      importHtml({ html: '<script>alert(1)</script><style>body{}</style>', original }),
    ).toThrow(/No readable content/)
  })
})

describe('Markdown import', () => {
  it('converts headings, lists, tables, code, links and images', () => {
    const preview = importMarkdown({
      text: `# Markdown title

Intro with [a link](https://example.com/page).

- First
- Second

| Column | Other |
| --- | --- |
| A | B |

\`\`\`js
const x = 1
\`\`\`

![Alt text](https://example.com/image.jpg)`,
      original,
      fileName: 'notes.md',
    })

    expect(preview.title).toBe('Markdown title')
    expect(preview.blocks[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(preview.blocks[1].type).toBe('paragraph')
    expect(preview.blocks[2].type).toBe('list')
    expect(preview.blocks[3].type).toBe('table')
    expect(preview.blocks[4]).toMatchObject({ type: 'paragraph', metadata: { format: 'code' } })
    expect(preview.blocks[5].type).toBe('image')
    expect(preview.sources[0].url).toBe('https://example.com/page')
    expect(preview.warnings.some((warning) => warning.code === 'inline-formatting')).toBe(false)
  })

  it('sanitizes raw HTML embedded in Markdown', () => {
    const preview = importMarkdown({
      text: '# Title\n\n<script>alert(1)</script>\n\nHello <b>world</b>',
      original,
    })
    const markup = JSON.stringify(preview.blocks)
    expect(markup).not.toContain('<script')
    expect(preview.warnings.some((warning) => warning.code === 'scripts-removed')).toBe(true)
  })
})

describe('text import', () => {
  it('keeps paragraphs and line breaks', () => {
    const preview = importText({
      text: 'First paragraph line one.\nLine two.\n\nSecond paragraph.',
      original,
      fileName: 'notes.txt',
    })
    expect(preview.blocks).toHaveLength(2)
    expect(preview.blocks[0]).toMatchObject({
      type: 'paragraph',
      html: 'First paragraph line one.<br>Line two.',
    })
    expect(preview.title).toBe('notes')
  })
})
