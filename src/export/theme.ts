import type { PageSize, Theme } from '../model/schema'

export interface ThemeDefinition {
  id: Theme
  name: string
  description: string
  pdfFontFamily: 'Helvetica' | 'Times-Roman'
  docxFontFamily: string
  printFontFamily: string
  bodyPt: number
  lineHeight: number
  headingSizes: [number, number, number, number, number, number]
  headingColor: string
  textColor: string
  mutedColor: string
  accentColor: string
  accentSoft: string
  borderColor: string
  marginPt: number
  imageMaxWidthPt: number
}

export const THEMES: Record<Theme, ThemeDefinition> = {
  classic: {
    id: 'classic',
    name: 'Classic',
    description: 'Serif body text, restrained headings, generous margins.',
    pdfFontFamily: 'Times-Roman',
    docxFontFamily: 'Georgia',
    printFontFamily: 'Georgia, "Times New Roman", serif',
    bodyPt: 11,
    lineHeight: 1.5,
    headingSizes: [24, 19, 16, 14, 12.5, 11.5],
    headingColor: '#1f2933',
    textColor: '#22272e',
    mutedColor: '#5f6b76',
    accentColor: '#7c4a2d',
    accentSoft: '#f5efe8',
    borderColor: '#d8d1c8',
    marginPt: 60,
    imageMaxWidthPt: 475,
  },
  modern: {
    id: 'modern',
    name: 'Modern',
    description: 'Sans-serif text, strong headings, blue accents.',
    pdfFontFamily: 'Helvetica',
    docxFontFamily: 'Arial',
    printFontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
    bodyPt: 10.5,
    lineHeight: 1.55,
    headingSizes: [26, 20, 16.5, 14, 12.5, 11.5],
    headingColor: '#102a43',
    textColor: '#243b53',
    mutedColor: '#627d98',
    accentColor: '#1668b3',
    accentSoft: '#e8f2fb',
    borderColor: '#c9d7e3',
    marginPt: 58,
    imageMaxWidthPt: 479,
  },
  compact: {
    id: 'compact',
    name: 'Compact',
    description: 'Tighter margins and spacing for dense reports.',
    pdfFontFamily: 'Helvetica',
    docxFontFamily: 'Calibri',
    printFontFamily: '"Segoe UI", Arial, sans-serif',
    bodyPt: 9.5,
    lineHeight: 1.4,
    headingSizes: [20, 16, 14, 12.5, 11.5, 10.5],
    headingColor: '#1f2933',
    textColor: '#2f3b45',
    mutedColor: '#6b7780',
    accentColor: '#2f5d50',
    accentSoft: '#edf4f1',
    borderColor: '#d5ddd8',
    marginPt: 42,
    imageMaxWidthPt: 511,
  },
}

export function getTheme(theme: Theme): ThemeDefinition {
  return THEMES[theme]
}

export function pageSizePoints(pageSize: PageSize): { width: number; height: number } {
  return pageSize === 'letter' ? { width: 612, height: 792 } : { width: 595.28, height: 841.89 }
}

export function contentWidthPt(theme: ThemeDefinition, pageSize: PageSize): number {
  return pageSizePoints(pageSize).width - theme.marginPt * 2
}

export function themeCssVariables(theme: ThemeDefinition): Record<string, string> {
  return {
    '--print-font': theme.printFontFamily,
    '--print-body-size': `${theme.bodyPt}pt`,
    '--print-line-height': String(theme.lineHeight),
    '--print-text': theme.textColor,
    '--print-muted': theme.mutedColor,
    '--print-accent': theme.accentColor,
    '--print-accent-soft': theme.accentSoft,
    '--print-border': theme.borderColor,
    '--print-margin': `${(theme.marginPt / 72).toFixed(2)}in`,
    '--print-heading-color': theme.headingColor,
  }
}
