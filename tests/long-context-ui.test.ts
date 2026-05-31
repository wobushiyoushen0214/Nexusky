import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../packages/renderer/src/i18n'
import { getRelationTypeLabel } from '../packages/renderer/src/components/long-context/LongContextBadge'

describe('long-context UI helpers', () => {
  afterEach(async () => {
    await i18n.changeLanguage('zh-CN')
  })

  it('labels relation types compactly for the editor panel', () => {
    const t = i18n.t.bind(i18n)

    expect(getRelationTypeLabel('supports_goal', t)).toBe('目标')
    expect(getRelationTypeLabel('blocked_by', t)).toBe('阻塞')
    expect(getRelationTypeLabel('repeated_pattern', t)).toBe('模式')
  })

  it('uses English relation labels when the locale changes', async () => {
    await i18n.changeLanguage('en')
    const t = i18n.t.bind(i18n)

    expect(getRelationTypeLabel('supports_goal', t)).toBe('Goal')
    expect(getRelationTypeLabel('blocked_by', t)).toBe('Blocked')
    expect(getRelationTypeLabel('repeated_pattern', t)).toBe('Pattern')
  })
})
