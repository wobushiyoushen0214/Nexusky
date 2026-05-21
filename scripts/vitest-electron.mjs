import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const vitestPath = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))
const child = spawn(electronPath, [vitestPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  }
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
