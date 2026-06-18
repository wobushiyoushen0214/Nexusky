# Nexusky Release Trust Checklist

This checklist is the release gate for public desktop builds. Do not publish a v1.0 or later release unless every required item is checked.

## Required Secrets

- [ ] Windows signing certificate is stored as `WIN_CSC_LINK`.
- [ ] Windows certificate password is stored as `WIN_CSC_KEY_PASSWORD`.
- [ ] macOS Developer ID Application certificate is stored as `MAC_CSC_LINK`.
- [ ] macOS certificate password is stored as `MAC_CSC_KEY_PASSWORD`.
- [ ] Apple notarization API key is stored as `APPLE_API_KEY`.
- [ ] Apple notarization key ID is stored as `APPLE_API_KEY_ID`.
- [ ] Apple notarization issuer is stored as `APPLE_API_ISSUER`.

## Build Gates

- [ ] Windows build uses `verifyUpdateCodeSignature: true`.
- [ ] Windows NSIS artifact is signed by the expected publisher.
- [ ] macOS build uses hardened runtime.
- [ ] macOS DMG and ZIP are notarized for both x64 and arm64.
- [ ] GitHub release contains SHA256SUMS files for Windows, macOS x64, macOS arm64, and Linux.
- [ ] Auto-update metadata is published by electron-builder only after signed artifacts are built.

## Local Verification

Windows:

```powershell
Get-AuthenticodeSignature .\Nexusky-Setup.exe
Get-FileHash .\Nexusky-Setup.exe -Algorithm SHA256
```

macOS:

```bash
codesign --verify --deep --strict --verbose=2 /Applications/Nexusky.app
spctl --assess --type execute --verbose /Applications/Nexusky.app
xcrun stapler validate /Applications/Nexusky.app
shasum -a 256 Nexusky-*.dmg Nexusky-*.zip
```

Linux:

```bash
shasum -a 256 Nexusky-*.AppImage
```

## Release Notes

- [ ] Include the expected publisher name for Windows.
- [ ] Include checksum verification instructions or link to this checklist.
- [ ] Link to GitHub Releases as the manual fallback when auto-update fails.
- [ ] Mention that local Markdown vault data remains user-owned and is not part of the installer trust chain.
