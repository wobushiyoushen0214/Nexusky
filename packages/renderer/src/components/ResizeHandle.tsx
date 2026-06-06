import { useCallback, useRef, useState } from 'react'

interface ResizeHandleProps {
  side: 'left' | 'right'
  onResize: (delta: number) => void
}

export function ResizeHandle({ side, onResize }: ResizeHandleProps) {
  const startX = useRef(0)
  const dragging = useRef(false)
  const [isActive, setIsActive] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    startX.current = e.clientX
    dragging.current = true
    setIsActive(true)

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      startX.current = e.clientX
      onResize(side === 'right' ? -delta : delta)
    }

    const handleMouseUp = () => {
      dragging.current = false
      setIsActive(false)
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
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => {
        if (!dragging.current) setIsActive(false)
      }}
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
        width: 5,
        height: isActive ? 42 : 30,
        borderRadius: 999,
        background: isActive ? 'color-mix(in srgb, var(--bg-hover) 82%, transparent)' : 'transparent',
        opacity: isActive ? 1 : 0,
        boxShadow: 'none',
        transition: 'opacity 140ms, height 140ms, background 140ms',
      }} />
    </div>
  )
}
