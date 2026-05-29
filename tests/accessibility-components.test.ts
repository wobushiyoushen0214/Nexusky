import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Settings, getSettingsDialogTabTarget } from '../packages/renderer/src/components/settings/Settings'
import { ToastViewport } from '../packages/renderer/src/components/Toast'
import { useToastStore } from '../packages/renderer/src/stores/toast-store'

describe('accessibility component semantics', () => {
  afterEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.restoreAllMocks()
  })

  it('announces toast messages through live-region roles', () => {
    const html = renderToStaticMarkup(createElement(ToastViewport, {
      toasts: [
        { id: 'error', type: 'error', message: 'Save failed' },
        { id: 'info', type: 'info', message: 'Saved' },
      ],
      onRemove: () => {}
    }))

    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="false"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-label="Close notification"')
  })

  it('exposes Settings as a labelled modal dialog', () => {
    const html = renderToStaticMarkup(createElement(Settings, { open: true, onClose: () => {} }))

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="settings-dialog-title"')
    expect(html).toContain('id="settings-dialog-title"')
  })

  it('wraps Settings dialog tab focus at the first and last controls', () => {
    const first = createFocusableElement('first')
    const middle = createFocusableElement('middle')
    const last = createFocusableElement('last')
    const focusable = [first, middle, last]
    const container = {
      querySelectorAll: vi.fn(() => focusable),
      contains: vi.fn((element: Element) => focusable.includes(element as HTMLElement)),
      focus: vi.fn(),
      tabIndex: -1,
    } as unknown as HTMLElement

    expect(getSettingsDialogTabTarget(container, last, false)).toBe(first)
    expect(getSettingsDialogTabTarget(container, first, true)).toBe(last)
    expect(getSettingsDialogTabTarget(container, middle, false)).toBeNull()
    expect(getSettingsDialogTabTarget(container, {} as Element, false)).toBe(first)
  })
})

function createFocusableElement(id: string): HTMLElement {
  return {
    id,
    tabIndex: 0,
    hasAttribute: vi.fn(() => false),
    getAttribute: vi.fn(() => null),
    focus: vi.fn(),
  } as unknown as HTMLElement
}
