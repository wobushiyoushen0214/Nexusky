import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/main/src/index.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'packages/shared/src')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/main/src/preload.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'packages/renderer'),
    server: {
      port: 5188
    },
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
      include: ['dompurify']
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/renderer/index.html')
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
        '@shared': resolve(__dirname, 'packages/shared/src'),
        '@renderer': resolve(__dirname, 'packages/renderer/src'),
        'dompurify': resolve(__dirname, 'node_modules/.pnpm/dompurify@3.4.2/node_modules/dompurify/dist/purify.es.mjs')
      }
    }
  }
})
