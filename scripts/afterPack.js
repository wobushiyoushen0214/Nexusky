const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (process.platform !== 'darwin') {
    return
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)

  console.log(`  * Ad-hoc signing: ${appPath}`)

  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
    console.log('  * Ad-hoc signing complete')
  } catch (error) {
    console.warn(`  * Ad-hoc signing failed (non-fatal): ${error.message}`)
  }
}
