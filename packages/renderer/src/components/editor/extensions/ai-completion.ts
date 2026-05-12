import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const pluginKey = new PluginKey('aiCompletion')

interface CompletionState {
  text: string
  pos: number
  decorations: DecorationSet
}

const EMPTY_STATE: CompletionState = { text: '', pos: -1, decorations: DecorationSet.empty }

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let ghostElement: HTMLElement | null = null
let lastRequestText = ''
let lastResult = ''
let requestInFlight = false
let abortController: AbortController | null = null

function getOrCreateGhost(): HTMLElement {
  if (!ghostElement) {
    ghostElement = document.createElement('span')
    ghostElement.className = 'ai-ghost-text'
  }
  return ghostElement
}

async function fetchCompletion(textBefore: string, signal: AbortSignal): Promise<string> {
  try {
    const result = await (window as any).api.invoke('ai:complete', { text: textBefore })
    if (signal.aborted) return ''
    return result || ''
  } catch {
    return ''
  }
}

export const AICompletion = Extension.create({
  name: 'aiCompletion',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init(): CompletionState {
            return EMPTY_STATE
          },
          apply(tr, prev): CompletionState {
            const meta = tr.getMeta(pluginKey)
            if (meta?.clear) return EMPTY_STATE
            if (meta?.set) {
              const { text, pos } = meta.set
              const ghost = getOrCreateGhost()
              ghost.textContent = text
              const widget = Decoration.widget(pos, ghost, { side: 1, key: 'ai-ghost' })
              return { text, pos, decorations: DecorationSet.create(tr.doc, [widget]) }
            }
            if (prev.text && !tr.docChanged) return prev
            if (tr.docChanged) return EMPTY_STATE
            return prev
          }
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state)?.decorations || DecorationSet.empty
          },
          handleKeyDown(view, event) {
            const completion = pluginKey.getState(view.state) as CompletionState
            if (!completion.text) return false

            if (event.key === 'Tab') {
              event.preventDefault()
              // Immediately hide ghost to prevent visual duplication
              if (ghostElement) ghostElement.style.display = 'none'
              const { tr } = view.state
              tr.insertText(completion.text, completion.pos)
              tr.setMeta(pluginKey, { clear: true })
              view.dispatch(tr)
              // Reset ghost visibility for next use
              if (ghostElement) ghostElement.style.display = ''
              return true
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              if (ghostElement) ghostElement.style.display = 'none'
              view.dispatch(view.state.tr.setMeta(pluginKey, { clear: true }))
              if (ghostElement) ghostElement.style.display = ''
              return true
            }

            return false
          }
        },
        view() {
          return {
            update(view) {
              if (debounceTimer) clearTimeout(debounceTimer)

              const completion = pluginKey.getState(view.state) as CompletionState
              if (completion.text) return

              debounceTimer = setTimeout(async () => {
                const { state } = view
                const { from } = state.selection
                if (!state.selection.empty) return
                if (requestInFlight) return

                const textBefore = state.doc.textBetween(Math.max(0, from - 500), from)
                if (textBefore.length < 10) return

                if (textBefore === lastRequestText && lastResult) {
                  view.dispatch(view.state.tr.setMeta(pluginKey, { set: { text: lastResult, pos: from } }))
                  return
                }

                if (abortController) abortController.abort()
                abortController = new AbortController()
                const signal = abortController.signal

                requestInFlight = true
                const result = await fetchCompletion(textBefore, signal)
                requestInFlight = false
                if (!result || signal.aborted) return
                if (view.state.selection.from !== from) return

                const current = pluginKey.getState(view.state) as CompletionState
                if (current.text) return

                lastRequestText = textBefore
                lastResult = result
                view.dispatch(view.state.tr.setMeta(pluginKey, { set: { text: result, pos: from } }))
              }, 800)
            },
            destroy() {
              if (debounceTimer) clearTimeout(debounceTimer)
              ghostElement = null
            }
          }
        }
      })
    ]
  }
})
