import { spawn, spawnSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

function runElectronNativeCheck() {
  const electronBin = resolve(
    root,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron'
  )
  const checkEnv = { ...env, ELECTRON_RUN_AS_NODE: '1' }
  const checkArgs = ['-e', "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.close();"]

  const check = spawnSync(electronBin, checkArgs, {
    cwd: root,
    env: checkEnv,
    encoding: 'utf8'
  })

  if (check.status === 0) return

  const output = `${check.stdout ?? ''}${check.stderr ?? ''}`
  const hasNativeAbiMismatch =
    output.includes('NODE_MODULE_VERSION') ||
    output.includes('ERR_DLOPEN_FAILED') ||
    output.includes('was compiled against a different Node.js version') ||
    output.includes('Could not locate the bindings file')

  if (!hasNativeAbiMismatch) {
    process.stderr.write(output)
    process.exit(check.status ?? 1)
  }

  console.warn('Native dependency ABI mismatch detected. Rebuilding for Electron...')

  const rebuild = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'rebuild'], {
    cwd: root,
    env,
    stdio: 'inherit'
  })

  if (rebuild.status !== 0) {
    process.exit(rebuild.status ?? 1)
  }

  const recheck = spawnSync(electronBin, checkArgs, {
    cwd: root,
    env: checkEnv,
    encoding: 'utf8'
  })

  if (recheck.status !== 0) {
    process.stderr.write(`${recheck.stdout ?? ''}${recheck.stderr ?? ''}`)
    process.exit(recheck.status ?? 1)
  }
}

runElectronNativeCheck()

const child = spawn('npx', ['electron-vite', 'dev'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true
})

child.on('close', (code) => {
  process.exit(code ?? 0)
})
