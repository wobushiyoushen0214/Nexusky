export interface GraphGroupColorSeed {
  id: string
  seed: string
}

const GOLDEN_ANGLE = 137.50776405
const LIGHTNESS_STEPS = [68, 61, 74, 56, 70, 63] as const
const CHROMA_STEPS = [0.15, 0.17, 0.12, 0.14, 0.13, 0.16] as const

function hashGraphColorSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function formatGraphGroupColor(baseHue: number, index: number, hash: number): string {
  const hueJitter = ((hash >>> 8) % 31) * 0.37
  const hue = (baseHue + index * GOLDEN_ANGLE + hueJitter) % 360
  const toneIndex = index % LIGHTNESS_STEPS.length
  const lightness = LIGHTNESS_STEPS[toneIndex]
  const chroma = CHROMA_STEPS[toneIndex]
  return `oklch(${lightness}% ${chroma} ${hue.toFixed(1)})`
}

export function buildGraphGroupColorMap(groups: readonly GraphGroupColorSeed[]): Map<string, string> {
  const uniqueGroups = new Map<string, GraphGroupColorSeed>()
  groups.forEach((group) => {
    if (!group.id) return
    uniqueGroups.set(group.id, {
      id: group.id,
      seed: group.seed || group.id,
    })
  })

  const orderedGroups = [...uniqueGroups.values()]
    .map((group) => ({
      ...group,
      hash: hashGraphColorSeed(group.seed),
    }))
    .sort((a, b) => a.hash - b.hash || a.id.localeCompare(b.id))

  const baseHue = orderedGroups.length === 0
    ? 0
    : hashGraphColorSeed(orderedGroups.map((group) => group.seed).join('\u001f')) % 360

  const colorMap = new Map<string, string>()
  orderedGroups.forEach((group, index) => {
    colorMap.set(group.id, formatGraphGroupColor(baseHue, index, group.hash))
  })
  return colorMap
}
