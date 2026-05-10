import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const pluginKey = new PluginKey('aiCompletion')

let completionText = ''
let completionPos = -1
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function fetchCompletion(textBefore: string): Promise<string> {
  try {
    const result = await (window as any).api.invoke('ai:complete', { text: textBefore })
    return result || ''
  } catch {
    return ''
  }
}

export const AICompletion = Extension.create({
  name: 'aiCompletion',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return DecorationSet.empty
          },
          apply(tr, decorationSet) {
            if (completionText && completionPos >= 0) {
              const widget = Decoration.widget(completionPos, () => {
                const span = document.createElement('span')
                span.className = 'ai-ghost-text'
                span.textContent = completionText
                return span
              }, { side: 1 })
              return DecorationSet.create(tr.doc, [widget])
            }
            return DecorationSet.empty
          }
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state)
          },
          handleKeyDown(view, event) {
            if (event.key === 'Tab' && completionText) {
              event.preventDefault()
              const { state, dispatch } = view
              const tr = state.tr.insertText(completionText, completionPos)
              dispatch(tr)
              completionText = ''
              completionPos = -1
              return true
            }
            if (event.key === 'Escape' && completionText) {
              completionText = ''
              completionPos = -1
              view.dispatch(view.state.tr)
              return true
            }
            if (completionText && event.key !== 'Shift' && event.key !== 'Control' && event.key !== 'Alt') {
              completionText = ''
              completionPos = -1
            }
            return false
          }
        },
        view() {
          return {
            update(view) {
              if (debounceTimer) clearTimeout(debounceTimer)

              debounceTimer = setTimeout(async () => {
                const { state } = view
                const { from } = state.selection
                const textBefore = state.doc.textBetween(Math.max(0, from - 200), from)

                if (textBefore.length < 10) return
                if (completionText) return

                const result = await fetchCompletion(textBefore)
                if (result && view.state.selection.from === from) {
                  completionText = result
                  completionPos = from
                  view.dispatch(view.state.tr)
                }
              }, 1500)
            }
          }
        }
      })
    ]
  }
})
