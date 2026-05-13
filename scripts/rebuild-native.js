const { execSync } = require('child_process')
const path = require('path')

exports.default = async function (context) {
  const arch = { 1: 'x64', 3: 'arm64' }[context.arch] || 'x64'
  const projectDir = context.packager.info.projectDir
  const electronVersion = require(path.join(projectDir, 'node_modules/electron/package.json')).version

  // Resolve @electron/rebuild from the project root — works for pnpm/npm/yarn regardless of nested path
  const rebuildCli = require.resolve('@electron/rebuild/lib/cli.js', { paths: [projectDir] })

  console.log(`  • Rebuilding better-sqlite3 for ${process.platform}-${arch} (electron v${electronVersion})`)
  console.log(`  • Using rebuild CLI: ${rebuildCli}`)

  execSync(
    `node "${rebuildCli}" --version=${electronVersion} --arch=${arch} --module-dir="${projectDir}" --only=better-sqlite3 --force`,
    { stdio: 'inherit', cwd: projectDir }
  )
}
