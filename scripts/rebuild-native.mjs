import { spawnSync } from 'child_process'
import { createRequire } from 'module'
import { dirname, resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const require = createRequire(resolve(root, 'package.json'))

function getElectronVersion() {
  const electronPackagePath = resolve(root, 'node_modules', 'electron', 'package.json')
  const electronPackage = JSON.parse(readFileSync(electronPackagePath, 'utf8'))
  return electronPackage.version
}

function getBetterSqlite3Root() {
  return dirname(require.resolve('better-sqlite3/package.json'))
}

function findNodeGyp() {
  const candidates = [
    process.env.npm_config_node_gyp,
    resolve(
      dirname(dirname(process.execPath)),
      'lib',
      'node_modules',
      'pnpm',
      'dist',
      'node_modules',
      'node-gyp',
      'bin',
      'node-gyp.js'
    ),
    resolve(
      root,
      'node_modules',
      '.pnpm',
      'node-gyp@9.4.1',
      'node_modules',
      'node-gyp',
      'bin',
      'node-gyp.js'
    )
  ].filter(Boolean)

  const nodeGyp = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!nodeGyp) {
    throw new Error('node-gyp not found. Run pnpm install first.')
  }
  return nodeGyp
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    ...options
  })

  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function trySpawn(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    ...options
  })
  return !result.error && result.status === 0
}

function tryPrebuildInstall(betterSqlite3Root, electronVersion) {
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const args = [
    'prebuild-install',
    '--runtime=electron',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`,
    '--tag-prefix=v'
  ]
  console.log('Trying prebuild-install for better-sqlite3...')
  return trySpawn(npxBin, args, { cwd: betterSqlite3Root, shell: process.platform === 'win32' })
}

const electronVersion = getElectronVersion()
const betterSqlite3Root = getBetterSqlite3Root()

if (!tryPrebuildInstall(betterSqlite3Root, electronVersion)) {
  console.log('prebuild-install unavailable; falling back to node-gyp rebuild')
  const nodeGyp = findNodeGyp()
  const electronHeadersCache = resolve(root, 'node_modules', '.cache', 'electron-gyp')

  run(process.execPath, [
    nodeGyp,
    'rebuild',
    '--release',
    `--target=${electronVersion}`,
    `--arch=${process.arch}`,
    '--dist-url=https://www.electronjs.org/headers',
    '--runtime=electron',
    `--devdir=${electronHeadersCache}`
  ], {
    cwd: betterSqlite3Root
  })
}

if (process.platform === 'win32' && process.env.CI) {
  console.log('better-sqlite3 rebuilt for Electron; skipping Electron smoke test on Windows CI')
  process.exit(0)
}

const electronExe = require('electron')
run(electronExe, [
  '-e',
  "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.close(); console.log('better-sqlite3 rebuilt for Electron ABI ' + process.versions.modules)"
], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
