import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

function readLocale(language: 'en' | 'zh-CN') {
  return JSON.parse(readFileSync(join(process.cwd(), 'packages/renderer/src/i18n/locales', `${language}.json`), 'utf8')) as Record<string, any>
}

describe('product boundary copy', () => {
  it('keeps Properties View framed around Markdown frontmatter, not an object database', () => {
    const commandPaletteSource = readFileSync(join(process.cwd(), 'packages/renderer/src/components/CommandPalette.tsx'), 'utf8')
    const basesCommandLine = commandPaletteSource
      .split('\n')
      .find((line) => line.includes("id: 'bases'"))
    const propertiesCommandLine = commandPaletteSource
      .split('\n')
      .find((line) => line.includes("id: 'properties'"))
    const en = readLocale('en')
    const zh = readLocale('zh-CN')
    const checkedCopy = [
      basesCommandLine,
      propertiesCommandLine,
      en.commandPalette.commands.bases.label,
      en.commandPalette.commands.bases.description,
      en.commandPalette.commands.properties.label,
      en.commandPalette.commands.properties.description,
      en.bases.title,
      en.bases.emptyHint,
      en.bases.guideFrontmatter,
      en.bases.columnsHint,
      zh.commandPalette.commands.bases.label,
      zh.commandPalette.commands.bases.description,
      zh.commandPalette.commands.properties.label,
      zh.commandPalette.commands.properties.description,
      zh.bases.title,
      zh.bases.emptyHint,
      zh.bases.guideFrontmatter,
      zh.bases.columnsHint
    ].join('\n')

    expect(checkedCopy).toContain('frontmatter')
    expect(checkedCopy).toContain('metadata')
    expect(checkedCopy).not.toMatch(/\bdatabase\b/i)
    expect(checkedCopy).not.toMatch(/\bobject\b/i)
    expect(checkedCopy).not.toMatch(/\bsupertag\b/i)
  })
})
