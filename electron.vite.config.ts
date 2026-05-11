import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
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
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'packages/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'packages/shared/src'),
        '@renderer': resolve(__dirname, 'packages/renderer/src')
      }
    }
  }
})
