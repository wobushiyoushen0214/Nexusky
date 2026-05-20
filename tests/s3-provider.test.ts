import { describe, expect, it } from 'vitest'
import { buildS3ListUrl, buildS3ObjectUrl, normalizeS3Config, parseS3ListObjects, s3ObjectKey, signS3Request } from '../packages/main/src/services/cloud/s3-provider'

describe('s3 provider helpers', () => {
  const config = normalizeS3Config({
    endpoint: 'https://s3.example.com/',
    region: 'us-east-1',
    bucket: 'notes',
    accessKeyId: 'AKID',
    secretAccessKey: 'SECRET',
    prefix: '/Nexusky Vault/'
  })

  it('normalizes config and builds path-style urls', () => {
    expect(config.prefix).toBe('Nexusky Vault')
    expect(s3ObjectKey(config, 'Folder/中文.md')).toBe('Nexusky Vault/Folder/中文.md')
    expect(buildS3ObjectUrl(config, 'Folder/中文.md')).toBe('https://s3.example.com/notes/Nexusky%20Vault/Folder/%E4%B8%AD%E6%96%87.md')
    expect(buildS3ListUrl(config)).toBe('https://s3.example.com/notes?list-type=2&prefix=Nexusky+Vault%2F')
  })

  it('parses S3 ListObjectsV2 XML', () => {
    const xml = `
      <ListBucketResult>
        <Contents><Key>Nexusky/A.md</Key><LastModified>2026-05-20T00:00:00.000Z</LastModified><ETag>"abc"</ETag></Contents>
        <Contents><Key>Nexusky/Folder/B.md</Key><LastModified>2026-05-20T00:01:00.000Z</LastModified><ETag>"def"</ETag></Contents>
      </ListBucketResult>
    `

    expect(parseS3ListObjects(xml)).toEqual([
      { key: 'Nexusky/A.md', lastModified: '2026-05-20T00:00:00.000Z', etag: 'abc' },
      { key: 'Nexusky/Folder/B.md', lastModified: '2026-05-20T00:01:00.000Z', etag: 'def' }
    ])
  })

  it('signs requests with AWS Signature V4 authorization headers', () => {
    const headers = signS3Request(config, 'GET', buildS3ListUrl(config), '', {}, new Date('2026-05-20T12:00:00.000Z'))

    expect(headers['x-amz-date']).toBe('20260520T120000Z')
    expect(headers.Authorization).toContain('AWS4-HMAC-SHA256 Credential=AKID/20260520/us-east-1/s3/aws4_request')
    expect(headers.Authorization).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date')
  })
})
