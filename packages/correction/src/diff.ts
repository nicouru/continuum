export type TextDiffOp =
  | { type: "equal"; text: string }
  | { type: "insert"; text: string }
  | { type: "delete"; text: string }
  | { type: "replace"; original: string; replacement: string }

export type CorrectionDiffChange = {
  original: string
  replacement: string
  originalOffset: number
  originalLength: number
}

const TOKEN_PATTERN = /(\s+|[^\s]+)/gu

export function tokenizeForDiff(text: string): string[] {
  const tokens = text.match(TOKEN_PATTERN)
  return tokens ?? (text.length > 0 ? [text] : [])
}

function longestCommonSubsequence(a: string[], b: string[]): number[][] {
  const rows = a.length + 1
  const cols = b.length + 1
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      if (a[row - 1] === b[col - 1]) {
        table[row][col] = table[row - 1][col - 1] + 1
      } else {
        table[row][col] = Math.max(table[row - 1][col], table[row][col - 1])
      }
    }
  }

  return table
}

function backtrackDiff(a: string[], b: string[], table: number[][]): TextDiffOp[] {
  const ops: TextDiffOp[] = []
  let row = a.length
  let col = b.length

  while (row > 0 || col > 0) {
    if (row > 0 && col > 0 && a[row - 1] === b[col - 1]) {
      ops.push({ type: "equal", text: a[row - 1] })
      row -= 1
      col -= 1
      continue
    }

    if (col > 0 && (row === 0 || table[row][col - 1] >= table[row - 1][col])) {
      ops.push({ type: "insert", text: b[col - 1] })
      col -= 1
      continue
    }

    if (row > 0) {
      ops.push({ type: "delete", text: a[row - 1] })
      row -= 1
    }
  }

  ops.reverse()
  return ops
}

export function diffTokenTexts(originalText: string, correctedText: string): TextDiffOp[] {
  const originalTokens = tokenizeForDiff(originalText)
  const correctedTokens = tokenizeForDiff(correctedText)
  const table = longestCommonSubsequence(originalTokens, correctedTokens)
  const rawOps = backtrackDiff(originalTokens, correctedTokens, table)

  const merged: TextDiffOp[] = []

  for (let index = 0; index < rawOps.length; index += 1) {
    const op = rawOps[index]
    const next = rawOps[index + 1]

    if (
      op.type === "delete" &&
      next?.type === "insert" &&
      !/\s/u.test(op.text) &&
      !/\s/u.test(next.text)
    ) {
      merged.push({
        type: "replace",
        original: op.text,
        replacement: next.text,
      })
      index += 1
      continue
    }

    merged.push(op)
  }

  return merged
}

export function buildCorrectionDiffChanges(
  originalText: string,
  correctedText: string,
): CorrectionDiffChange[] {
  if (originalText === correctedText) {
    return []
  }

  const ops = diffTokenTexts(originalText, correctedText)
  const changes: CorrectionDiffChange[] = []
  let offset = 0

  for (const op of ops) {
    if (op.type === "equal") {
      offset += op.text.length
      continue
    }

    if (op.type === "delete") {
      changes.push({
        original: op.text,
        replacement: "",
        originalOffset: offset,
        originalLength: op.text.length,
      })
      offset += op.text.length
      continue
    }

    if (op.type === "insert") {
      changes.push({
        original: "",
        replacement: op.text,
        originalOffset: offset,
        originalLength: 0,
      })
      continue
    }

    changes.push({
      original: op.original,
      replacement: op.replacement,
      originalOffset: offset,
      originalLength: op.original.length,
    })
    offset += op.original.length
  }

  return changes.filter(
    (change) =>
      change.original !== change.replacement &&
      !(change.original === "" && change.replacement === ""),
  )
}
