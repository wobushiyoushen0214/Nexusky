export function normalizeObsidianLinkTarget(value: string): string {
  return value
    .split('|')[0]
    .split('#')[0]
    .replace(/\^[A-Za-z0-9_-]+$/, '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
}
