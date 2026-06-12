import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  ContextMenu as ContextMenuRoot,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ui/context-menu'

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
  const closedRef = useRef(false)

  useEffect(() => {
    closedRef.current = false
  }, [x, y, items])

  const closeOnce = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }, [onClose])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) closeOnce()
  }, [closeOnce])

  return (
    <ContextMenuRoot open onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild>
        <span
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: x,
            top: y,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />
      </ContextMenuTrigger>
      <ContextMenuContent
        alignOffset={0}
        collisionPadding={8}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <ContextMenuGroup>
          {items.map((item, index) => (
            <ContextMenuItem
              key={`${item.label}-${index}`}
              disabled={item.disabled}
              variant={item.danger ? 'danger' : 'default'}
              onSelect={() => {
                if (item.disabled) return
                item.onClick()
                closeOnce()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </ContextMenuItem>
          ))}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenuRoot>
  )
}
