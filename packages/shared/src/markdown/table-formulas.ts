export interface TableFormulaResult {
  markdown: string
  changed: boolean
  formulas: number
}

type CellMatrix = string[][]

const FORMULA_PREFIX = '='

function isSeparatorLine(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function splitTableRow(line: string): string[] {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|')) value = value.slice(0, -1)
  const cells: string[] = []
  let current = ''
  let escaped = false
  for (const char of value) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      current += char
      escaped = true
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function buildTableRow(cells: string[]): string {
  return `| ${cells.map((cell) => cell.trim()).join(' | ')} |`
}

function buildSeparator(width: number): string {
  return `| ${Array.from({ length: width }, () => '---').join(' | ')} |`
}

function columnToIndex(column: string): number {
  let index = 0
  for (const char of column.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64)
  }
  return index - 1
}

function numberFromCell(value: string): number {
  const numeric = Number(value.replace(/[$,%\s,]/g, ''))
  return Number.isFinite(numeric) ? numeric : 0
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(4))).replace(/\.0+$/, '')
}

function valuesInRange(matrix: CellMatrix, start: string, end: string, resolveCell: (ref: string) => number): number[] {
  const startMatch = start.match(/^([A-Z]+)(\d+)$/i)
  const endMatch = end.match(/^([A-Z]+)(\d+)$/i)
  if (!startMatch || !endMatch) return []
  const c1 = columnToIndex(startMatch[1])
  const c2 = columnToIndex(endMatch[1])
  const r1 = Number(startMatch[2]) - 1
  const r2 = Number(endMatch[2]) - 1
  const values: number[] = []
  for (let row = Math.min(r1, r2); row <= Math.max(r1, r2); row += 1) {
    for (let col = Math.min(c1, c2); col <= Math.max(c1, c2); col += 1) {
      if (matrix[row]?.[col] !== undefined) values.push(resolveCell(`${indexToColumn(col)}${row + 1}`))
    }
  }
  return values
}

function indexToColumn(index: number): string {
  let n = index + 1
  let column = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    column = String.fromCharCode(65 + rem) + column
    n = Math.floor((n - 1) / 26)
  }
  return column
}

function evaluateFormula(expression: string, matrix: CellMatrix, stack = new Set<string>()): number {
  const memo = new Map<string, number>()

  const resolveCell = (ref: string): number => {
    const normalized = ref.toUpperCase()
    if (memo.has(normalized)) return memo.get(normalized)!
    if (stack.has(normalized)) return 0
    const match = normalized.match(/^([A-Z]+)(\d+)$/)
    if (!match) return 0
    const col = columnToIndex(match[1])
    const row = Number(match[2]) - 1
    const raw = matrix[row]?.[col] || ''
    stack.add(normalized)
    const value = raw.trim().startsWith(FORMULA_PREFIX)
      ? evaluateFormula(raw.trim().slice(1), matrix, stack)
      : numberFromCell(raw)
    stack.delete(normalized)
    memo.set(normalized, value)
    return value
  }

  let safeExpression = expression.replace(/\b(SUM|AVG|MIN|MAX)\(([A-Z]+\d+):([A-Z]+\d+)\)/gi, (_match, fn: string, start: string, end: string) => {
    const values = valuesInRange(matrix, start, end, resolveCell)
    if (values.length === 0) return '0'
    switch (fn.toUpperCase()) {
      case 'SUM': return String(values.reduce((sum, value) => sum + value, 0))
      case 'AVG': return String(values.reduce((sum, value) => sum + value, 0) / values.length)
      case 'MIN': return String(Math.min(...values))
      case 'MAX': return String(Math.max(...values))
      default: return '0'
    }
  })

  safeExpression = safeExpression.replace(/\b([A-Z]+\d+)\b/gi, (_match, ref: string) => String(resolveCell(ref)))
  if (!/^[0-9+\-*/().\s]+$/.test(safeExpression)) return 0
  try {
    const value = Function(`"use strict"; return (${safeExpression})`)()
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function calculateTable(lines: string[]): { lines: string[]; formulas: number } {
  const header = splitTableRow(lines[0])
  const body = lines.slice(2).map(splitTableRow)
  const width = Math.max(header.length, ...body.map((row) => row.length))
  const matrix: CellMatrix = [
    [...header, ...Array(Math.max(0, width - header.length)).fill('')],
    ...body.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill('')])
  ]
  let formulas = 0

  for (let row = 1; row < matrix.length; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const cell = matrix[row][col].trim()
      if (!cell.startsWith(FORMULA_PREFIX)) continue
      matrix[row][col] = formatNumber(evaluateFormula(cell.slice(1), matrix))
      formulas += 1
    }
  }

  return {
    formulas,
    lines: [
      buildTableRow(matrix[0]),
      buildSeparator(width),
      ...matrix.slice(1).map(buildTableRow)
    ]
  }
}

export function calculateMarkdownTableFormulas(markdown: string): TableFormulaResult {
  const lines = markdown.split(/\r?\n/)
  const output: string[] = []
  let formulas = 0
  let changed = false

  for (let i = 0; i < lines.length; i += 1) {
    if (i + 1 < lines.length && lines[i].includes('|') && isSeparatorLine(lines[i + 1])) {
      const tableLines = [lines[i], lines[i + 1]]
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        tableLines.push(lines[i])
        i += 1
      }
      i -= 1
      const calculated = calculateTable(tableLines)
      formulas += calculated.formulas
      changed = changed || calculated.formulas > 0
      output.push(...calculated.lines)
    } else {
      output.push(lines[i])
    }
  }

  return { markdown: output.join('\n'), changed, formulas }
}
