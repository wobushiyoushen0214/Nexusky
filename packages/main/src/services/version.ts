interface ParsedVersion {
  parts: number[]
  prerelease: string[]
}

export function parseVersion(version?: string): ParsedVersion | null {
  if (!version) return null

  const [base] = version.trim().replace(/^v/i, '').split('+')
  const [main, prerelease = ''] = base.split('-', 2)
  if (!/^\d+(?:\.\d+)*$/.test(main)) return null

  const parts = main.split('.').map((part) => Number(part))
  const prereleaseParts = prerelease ? prerelease.split('.') : []
  if (prereleaseParts.some((part) => part.length === 0)) return null

  while (parts.length < 3) parts.push(0)
  return { parts, prerelease: prereleaseParts }
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1

  const maxLength = Math.max(a.length, b.length)
  for (let i = 0; i < maxLength; i++) {
    const left = a[i]
    const right = b[i]
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue

    const leftNumber = Number(left)
    const rightNumber = Number(right)
    const leftIsNumber = Number.isInteger(leftNumber)
    const rightIsNumber = Number.isInteger(rightNumber)

    if (leftIsNumber && rightIsNumber) return leftNumber - rightNumber
    if (leftIsNumber) return -1
    if (rightIsNumber) return 1
    return left.localeCompare(right)
  }

  return 0
}

export function isVersionNewer(candidateVersion?: string, currentVersion?: string): boolean {
  const candidate = parseVersion(candidateVersion)
  const current = parseVersion(currentVersion)

  if (!candidate || !current) return false

  for (let i = 0; i < Math.max(candidate.parts.length, current.parts.length); i++) {
    const diff = (candidate.parts[i] ?? 0) - (current.parts[i] ?? 0)
    if (diff !== 0) return diff > 0
  }

  return comparePrerelease(candidate.prerelease, current.prerelease) > 0
}
