import { useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'

let mermaidInstance: typeof import('mermaid').default | null = null
let mermaidLoading: Promise<typeof import('mermaid').default> | null = null
let mermaidId = 0
const MAX_SVG_CACHE_SIZE = 50
const svgCache = new Map<string, string>()

function getCachedSvg(code: string): string | undefined {
  const cached = svgCache.get(code)
  if (!cached) return undefined
  svgCache.delete(code)
  svgCache.set(code, cached)
  return cached
}

function setCachedSvg(code: string, svg: string): void {
  if (svgCache.has(code)) svgCache.delete(code)
  svgCache.set(code, svg)
  if (svgCache.size > MAX_SVG_CACHE_SIZE) {
    const oldest = svgCache.keys().next().value
    if (oldest) svgCache.delete(oldest)
  }
}

async function getMermaid() {
  if (mermaidInstance) return mermaidInstance
  if (!mermaidLoading) {
    mermaidLoading = import('mermaid').then((m) => {
      mermaidInstance = m.default
      mermaidInstance.initialize({ startOnLoad: false, theme: 'dark', darkMode: true })
      return mermaidInstance
    })
  }
  return mermaidLoading
}

export function MermaidRenderer({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState(() => getCachedSvg(code.trim()) || '')
  const [error, setError] = useState('')

  useEffect(() => {
    const trimmed = code.trim()
    if (!trimmed) return

    const cached = getCachedSvg(trimmed)
    if (cached) { setSvg(cached); setError(''); return }

    let cancelled = false
    const id = `mermaid-${++mermaidId}`

    getMermaid().then((mermaid) => {
      if (cancelled) return
      mermaid.render(id, trimmed).then(
        (result) => { if (!cancelled) { setCachedSvg(trimmed, result.svg); setSvg(result.svg); setError('') } },
        (err) => { if (!cancelled) { setError(err.message || '渲染失败'); setSvg('') } }
      )
    })

    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--danger)', background: 'var(--danger-muted)', borderRadius: 6 }}>
        Mermaid 语法错误: {error}
      </div>
    )
  }

  if (!svg) return null

  return (
    <div
      ref={containerRef}
      style={{ padding: '16px', display: 'flex', justifyContent: 'center', overflow: 'auto' }}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true }, ADD_TAGS: ['foreignObject'] }) }}
    />
  )
}
