import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: __dirname,
  server: {
    port: 5188,
    strictPort: true
  },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ['dompurify']
  },
  build: {
    outDir: resolve(__dirname, '../../out/renderer-tauri'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.match(/[\\/]react[\\/]/)) return 'vendor-react'
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'vendor-tiptap'
            if (id.includes('d3-')) return 'vendor-d3'
            if (id.includes('katex')) return 'vendor-katex'
            if (id.includes('marked') || id.includes('dompurify')) return 'vendor-marked'
          }
        }
      }
    }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../shared/src'),
      '@renderer': resolve(__dirname, 'src'),
      'dompurify': resolve(__dirname, '../../node_modules/dompurify/dist/purify.es.mjs')
    }
  }
})
