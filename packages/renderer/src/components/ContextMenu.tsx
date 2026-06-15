import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './ui/ui.css'

interface ContextMenuItemDef {
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItemDef[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const closedRef = useRef(false)
  const [position, setPosition] = useState({ left: x, top: y })

  useEffect(() => {
    closedRef.current = false
    setPosition({ left: x, top: y })
  }, [x, y, items])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return

    const padding = 8
    const rect = menu.getBoundingClientRect()
    const maxLeft = window.innerWidth - rect.width - padding
    const maxTop = window.innerHeight - rect.height - padding

    setPosition({
      left: Math.max(padding, Math.min(x, maxLeft)),
      top: Math.max(padding, Math.min(y, maxTop)),
    })
  }, [x, y, items])

  const closeOnce = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }, [onClose])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      closeOnce()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOnce()
    }
    const handleContextMenu = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      closeOnce()
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('contextmenu', handleContextMenu, true)
    window.addEventListener('resize', closeOnce)
    window.addEventListener('scroll', closeOnce, true)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('contextmenu', handleContextMenu, true)
      window.removeEventListener('resize', closeOnce)
      window.removeEventListener('scroll', closeOnce, true)
    }
  }, [closeOnce])

  return createPortal(
    <div
      ref={menuRef}
      className="ui-context-menu-content"
      role="menu"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div role="group">
        {items.map((item, index) => (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role="menuitem"
            className="ui-context-menu-item"
            data-disabled={item.disabled ? '' : undefined}
            data-variant={item.danger ? 'danger' : undefined}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              item.onClick()
              closeOnce()
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
