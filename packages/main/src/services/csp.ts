export function buildContentSecurityPolicy(devRenderer = Boolean(process.env.ELECTRON_RENDERER_URL)): string {
  const devConnect = devRenderer ? ' http://localhost:* ws://localhost:*' : ''
  const scriptSrc = devRenderer ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'"
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self'${devConnect}`,
    "img-src 'self' data: blob: file:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "media-src 'self' data: blob: file:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}
