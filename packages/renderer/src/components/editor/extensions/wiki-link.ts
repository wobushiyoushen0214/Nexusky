import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      title: { default: null },
      alias: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-wiki-link': '',
      class: 'wiki-link'
    }), `[[${HTMLAttributes.alias || HTMLAttributes.title}]]`]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('wikiLinkDecoration'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const { doc } = state
            const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              let match: RegExpExecArray | null
              regex.lastIndex = 0
              while ((match = regex.exec(node.text)) !== null) {
                const start = pos + match.index
                const end = start + match[0].length
                decorations.push(
                  Decoration.inline(start, end, {
                    class: 'wiki-link-inline',
                    'data-title': match[1].trim()
                  })
                )
              }
            })

            return DecorationSet.create(doc, decorations)
          }
        }
      })
    ]
  }
})
