import { useToastStore, type ToastType } from '../stores/toast-store'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

const typeStyles: Record<ToastType, { bg: string; border: string; color: string }> = {
  success: { bg: 'color-mix(in srgb, oklch(68% 0.15 150) 12%, var(--bg-glass-dense, var(--panel-bg)))', border: 'oklch(68% 0.15 150 / 0.32)', color: 'oklch(55% 0.14 150)' },
  error: { bg: 'color-mix(in srgb, var(--danger-muted) 42%, var(--bg-glass-dense, var(--panel-bg)))', border: 'color-mix(in srgb, var(--danger) 36%, var(--glass-border))', color: 'var(--danger)' },
  info: { bg: 'color-mix(in srgb, var(--accent-muted) 44%, var(--bg-glass-dense, var(--panel-bg)))', border: 'color-mix(in srgb, var(--accent) 34%, var(--glass-border))', color: 'var(--accent-text)' },
}

export interface ToastView {
  id: string
  type: ToastType
  message: string
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  return <ToastViewport toasts={toasts} onRemove={remove} />
}

export function ToastViewport({
  toasts,
  onRemove
}: {
  toasts: ToastView[]
  onRemove: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
    }} aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const style = typeStyles[t.type]
        return (
          <div
            key={t.id}
            className="animate-slide-in-right glass-popover"
            role={t.type === 'error' ? 'alert' : 'status'}
            style={{
              padding: '10px 14px', borderRadius: 8,
              background: style.bg, border: `1px solid ${style.border}`,
              color: style.color, fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              backdropFilter: 'blur(var(--glass-blur)) saturate(160%)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(160%)',
              boxShadow: 'var(--shadow-popover)',
            }}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(t.id)}
                  aria-label="Close notification"
                  style={{
                    width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4, border: 'none', background: 'transparent',
                    color: style.color, cursor: 'pointer', opacity: 0.6, flexShrink: 0,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Close notification</TooltipContent>
            </Tooltip>
          </div>
        )
      })}
    </div>
  )
}
