import { useToastStore } from '../stores/toast-store'

const typeStyles: Record<string, { bg: string; border: string; color: string }> = {
  success: { bg: 'rgba(74, 222, 128, 0.1)', border: 'rgba(74, 222, 128, 0.3)', color: '#4ade80' },
  error: { bg: 'rgba(248, 113, 113, 0.1)', border: 'rgba(248, 113, 113, 0.3)', color: '#f87171' },
  info: { bg: 'rgba(124, 110, 240, 0.1)', border: 'rgba(124, 110, 240, 0.3)', color: '#7c6ef0' },
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
    }}>
      {toasts.map((t) => {
        const style = typeStyles[t.type]
        return (
          <div
            key={t.id}
            className="animate-slide-in-right"
            style={{
              padding: '10px 14px', borderRadius: 8,
              background: style.bg, border: `1px solid ${style.border}`,
              color: style.color, fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              style={{
                width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4, border: 'none', background: 'transparent',
                color: style.color, cursor: 'pointer', opacity: 0.6, flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
