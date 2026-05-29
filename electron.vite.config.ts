import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DEV_RENDERER_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:* ws://localhost:*; img-src 'self' data: blob: file:; font-src 'self' data:; worker-src 'self' blob:; media-src 'self' data: blob: file:; object-src 'none'; base-uri 'none'"

function rendererDevCspPlugin(): Plugin {
  let isDevServer = false
  return {
    name: 'nexusky-renderer-dev-csp',
    enforce: 'pre',
    configResolved(config) {
      isDevServer = config.command === 'serve'
    },
    transformIndexHtml(html) {
      if (!isDevServer) return html
      return html.replace(
        /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(" \/>)/,
        `$1${DEV_RENDERER_CSP}$2`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      minify: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/main/src/index.ts'),
          indexVaultWorker: resolve(__dirname, 'packages/main/src/workers/index-vault-worker.ts')
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
    plugins: [rendererDevCspPlugin(), react(), tailwindcss()],
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
        'dompurify': resolve(__dirname, 'node_modules/dompurify/dist/purify.es.mjs')
      }
    }
  }
})
