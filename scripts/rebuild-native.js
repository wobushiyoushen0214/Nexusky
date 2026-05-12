const { execSync } = require('child_process')
const path = require('path')

exports.default = async function (context) {
  const arch = { 1: 'x64', 3: 'arm64' }[context.arch] || 'x64'
  const projectDir = context.packager.info.projectDir
  const electronVersion = require(path.join(projectDir, 'node_modules/electron/package.json')).version
  const rebuildCli = path.join(
    projectDir,
    'node_modules/.pnpm/@electron+rebuild@3.6.1/node_modules/@electron/rebuild/lib/cli.js'
  )

  console.log(`  • Rebuilding better-sqlite3 for darwin-${arch} (electron v${electronVersion})`)

  execSync(
    `node "${rebuildCli}" --version=${electronVersion} --arch=${arch} --module-dir="${projectDir}" --only=better-sqlite3 --force`,
    { stdio: 'inherit', cwd: projectDir }
  )
}
