import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  side: 'left' | 'right'
  onResize: (delta: number) => void
}

export function ResizeHandle({ side, onResize }: ResizeHandleProps) {
  const startX = useRef(0)
  const dragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startX.current = e.clientX
    dragging.current = true

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      startX.current = e.clientX
      onResize(side === 'right' ? -delta : delta)
    }

    const handleMouseUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [onResize, side])

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: 8,
        cursor: 'col-resize',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      <div style={{
        width: 3,
        height: 34,
        borderRadius: 999,
        background: 'linear-gradient(180deg, transparent, var(--glass-divider-line) 18%, var(--glass-divider-highlight) 50%, var(--glass-divider-line) 82%, transparent)',
        opacity: 0.78,
        boxShadow: '0 0 12px color-mix(in srgb, var(--glass-highlight) 36%, transparent), inset 1px 0 0 color-mix(in srgb, var(--glass-highlight) 42%, transparent)',
        backdropFilter: 'blur(8px) saturate(140%)',
        WebkitBackdropFilter: 'blur(8px) saturate(140%)',
        transition: 'opacity 150ms, height 150ms',
      }} />
    </div>
  )
}
