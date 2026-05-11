import { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, theme: 'dark', darkMode: true })

let mermaidId = 0

export function MermaidRenderer({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code.trim()) return
    const id = `mermaid-${++mermaidId}`
    mermaid.render(id, code.trim()).then(
      (result) => { setSvg(result.svg); setError('') },
      (err) => { setError(err.message || '渲染失败'); setSvg('') }
    )
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
