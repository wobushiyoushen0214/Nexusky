import { describe, expect, it } from 'vitest'
import { buildCrashReport, serializeCrashReport } from '../packages/main/src/services/crash-reporting'

describe('crash reporting', () => {
  it('builds structured reports with error stack and context', () => {
    const error = new Error('boom')
    const report = buildCrashReport('main:uncaughtException', 'boom', error, { windowId: 7 }, new Date('2026-05-20T00:00:00.000Z'))

    expect(report).toMatchObject({
      type: 'main:uncaughtException',
      message: 'boom',
      timestamp: '2026-05-20T00:00:00.000Z',
      context: { windowId: 7 }
    })
    expect(report.stack).toContain('boom')
    expect(report.platform).toContain(process.platform)
  })

  it('serializes reports as json lines payloads', () => {
    const report = buildCrashReport('renderer:processGone', 'crashed', undefined, { reason: 'crashed', exitCode: 139 }, new Date('2026-05-20T00:00:00.000Z'))
    const parsed = JSON.parse(serializeCrashReport(report)) as typeof report

    expect(parsed.type).toBe('renderer:processGone')
    expect(parsed.context).toEqual({ reason: 'crashed', exitCode: 139 })
  })
})
