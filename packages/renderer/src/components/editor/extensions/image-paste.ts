import { Extension } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const ImagePaste = Extension.create({
  name: 'imagePaste',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: new PluginKey('imagePaste'),
        props: {
          handlePaste(view, event) {
            const items = event.clipboardData?.items
            if (!items) return false

            for (const item of items) {
              if (item.type.startsWith('image/')) {
                event.preventDefault()
                const file = item.getAsFile()
                if (file) handleImageFile(file, editor)
                return true
              }
            }
            return false
          },
          handleDrop(view, event) {
            const files = event.dataTransfer?.files
            if (!files || files.length === 0) return false

            for (const file of files) {
              if (file.type.startsWith('image/')) {
                event.preventDefault()
                handleImageFile(file, editor)
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

async function handleImageFile(file: File, editor: Editor) {
  const reader = new FileReader()
  reader.onload = async () => {
    const base64 = reader.result as string
    const ext = file.type.split('/')[1] || 'png'
    const fileName = `${Date.now()}.${ext}`

    try {
      const vaultPath = await window.api.invoke('vault:get', undefined)
      if (!vaultPath) return

      const relativePath = await window.api.invoke('file:save-image', {
        vaultPath,
        imageData: base64,
        fileName
      })

      editor.chain().focus().insertContent(`![${file.name || 'image'}](${relativePath})`).run()
    } catch (err) {
      console.error('Failed to save image:', err)
    }
  }
  reader.readAsDataURL(file)
}
