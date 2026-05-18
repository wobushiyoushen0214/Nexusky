import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface SlashCommandItem {
  title: string
  description: string
  icon: string
  command: (editor: Editor) => void
}

const pluginKey = new PluginKey('slashCommand')

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,
        props: {
          handleKeyDown(view, event) {
            if (event.key === '/') {
              const { state } = view
              const { from } = state.selection
              if (!state.selection.empty) return false
              if (from > 1) {
                const charBefore = state.doc.textBetween(from - 1, from)
                if (charBefore && charBefore !== '\n' && charBefore !== ' ') return false
              }
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('slash-command-open', {
                  detail: { from }
                }))
              }, 10)
            }
            return false
          }
        }
      })
    ]
  }
})
