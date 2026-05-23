import { spawn, spawnSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const require = createRequire(resolve(root, 'package.json'))

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

function getElectronBinary() {
  const electronModule = require('electron')
  if (typeof electronModule !== 'string') {
    throw new Error(`Unexpected 'electron' module export: ${typeof electronModule}`)
  }
  return electronModule
}

function runElectronNativeCheck() {
  let electronBin
  try {
    electronBin = getElectronBinary()
  } catch (err) {
    process.stderr.write(`Failed to locate electron binary: ${err.message}\n`)
    process.exit(1)
  }

  const checkEnv = { ...env, ELECTRON_RUN_AS_NODE: '1' }
  const checkArgs = ['-e', "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.close();"]

  const check = spawnSync(electronBin, checkArgs, {
    cwd: root,
    env: checkEnv,
    encoding: 'utf8'
  })

  if (check.status === 0) return

  if (check.error) {
    process.stderr.write(`Failed to spawn electron for the native ABI check: ${check.error.message}\n`)
    process.exit(1)
  }

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

  const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const rebuild = spawnSync(pnpmBin, ['run', 'rebuild'], {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
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

function locateElectronViteCli() {
  const pkgPath = require.resolve('electron-vite/package.json')
  const pkg = require(pkgPath)
  const binEntry = pkg.bin && pkg.bin['electron-vite']
  if (!binEntry) {
    throw new Error('electron-vite package.json does not declare a bin entry')
  }
  return resolve(dirname(pkgPath), binEntry)
}

runElectronNativeCheck()

const electronViteCli = locateElectronViteCli()
const child = spawn(process.execPath, [electronViteCli, 'dev'], {
  cwd: root,
  env,
  stdio: 'inherit'
})

child.on('close', (code) => {
  process.exit(code ?? 0)
})
