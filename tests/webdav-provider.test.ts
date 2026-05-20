import { describe, expect, it } from 'vitest'
import { buildWebDavUrl, hrefToRelPath, normalizeWebDavConfig, parseWebDavHrefs } from '../packages/main/src/services/cloud/webdav-provider'

describe('webdav provider helpers', () => {
  it('normalizes config and builds encoded remote urls', () => {
    const config = normalizeWebDavConfig({
      url: 'https://dav.example.com/root/',
      folder: 'Nexusky 笔记'
    })

    expect(config).toEqual({ url: 'https://dav.example.com/root', username: '', password: '', folder: '/Nexusky 笔记' })
    expect(buildWebDavUrl(config, 'Projects/中文 Note.md')).toBe('https://dav.example.com/root/Nexusky%20%E7%AC%94%E8%AE%B0/Projects/%E4%B8%AD%E6%96%87%20Note.md')
  })

  it('extracts relative markdown paths from propfind hrefs', () => {
    const xml = `
      <d:multistatus>
        <d:response><d:href>/remote.php/dav/files/me/Nexusky/A.md</d:href></d:response>
        <d:response><d:href>/remote.php/dav/files/me/Nexusky/Folder/B%20Note.md</d:href></d:response>
        <d:response><d:href>/remote.php/dav/files/me/Nexusky/</d:href></d:response>
      </d:multistatus>
    `
    const config = normalizeWebDavConfig({ url: 'https://dav.example.com/remote.php/dav/files/me', folder: '/Nexusky' })
    const rels = parseWebDavHrefs(xml).map((href) => hrefToRelPath(href, config)).filter(Boolean)

    expect(rels).toEqual(['A.md', 'Folder/B Note.md'])
  })
})
