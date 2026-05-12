import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const decorationKey = new PluginKey('wikiLinkDecoration')

function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = []
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

  doc.descendants((node: any, pos: number) => {
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
        key: decorationKey,
        state: {
          init(_, { doc }) {
            return buildDecorations(doc)
          },
          apply(tr, oldDecorations) {
            if (!tr.docChanged) return oldDecorations
            return buildDecorations(tr.doc)
          }
        },
        props: {
          decorations(state) {
            return decorationKey.getState(state)
          },
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement
            if (target.classList.contains('wiki-link-inline') || target.closest('.wiki-link-inline')) {
              const el = target.classList.contains('wiki-link-inline') ? target : target.closest('.wiki-link-inline') as HTMLElement
              const title = el?.getAttribute('data-title')
              if (title) {
                window.dispatchEvent(new CustomEvent('navigate-wikilink', { detail: { title } }))
                return true
              }
            }
            return false
          }
        }
      })
    ]
  }
})
