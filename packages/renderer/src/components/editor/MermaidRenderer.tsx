import { useEffect, useRef, useState } from 'react'

let mermaidInstance: typeof import('mermaid').default | null = null
let mermaidLoading: Promise<typeof import('mermaid').default> | null = null
let mermaidId = 0
const svgCache = new Map<string, string>()

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
  const [svg, setSvg] = useState(() => svgCache.get(code.trim()) || '')
  const [error, setError] = useState('')

  useEffect(() => {
    const trimmed = code.trim()
    if (!trimmed) return

    const cached = svgCache.get(trimmed)
    if (cached) { setSvg(cached); setError(''); return }

    let cancelled = false
    const id = `mermaid-${++mermaidId}`

    getMermaid().then((mermaid) => {
      if (cancelled) return
      mermaid.render(id, trimmed).then(
        (result) => { if (!cancelled) { svgCache.set(trimmed, result.svg); setSvg(result.svg); setError('') } },
        (err) => { if (!cancelled) { setError(err.message || '渲染失败'); setSvg('') } }
      )
    })

    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <div style={{ padding: '8px 12px', fontSize: 11, color: '#f87171', background: 'rgba(248,113,113,0.1)', borderRadius: 6 }}>
        Mermaid 语法错误: {error}
      </div>
    )
  }

  if (!svg) return null

  return (
    <div
      ref={containerRef}
      style={{ padding: '16px', display: 'flex', justifyContent: 'center', overflow: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
