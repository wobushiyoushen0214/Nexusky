export function TitleBar() {
  return (
    <div
      style={{
        height: 40,
        padding: '0 0 0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-glass-solid)',
        backdropFilter: 'blur(24px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.2)',
        borderBottom: '1px solid var(--border-glow)',
        boxShadow: 'inset 0 -1px 0 var(--border-shine)',
        userSelect: 'none',
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: 'var(--accent-glow)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
            <path d="M12 3L2 7l10 4 10-4-10-4z" fill="currentColor" />
            <path d="M2 17l10 4 10-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
            <path d="M2 12l10 4 10-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          </svg>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>
          Nexusky
        </span>
      </div>

      {/* Window controls */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => window.api.windowControls.minimize()}
          style={controlBtnStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect width="10" height="1" fill="currentColor" rx="0.5" />
          </svg>
        </button>
        <button
          onClick={() => window.api.windowControls.maximize()}
          style={controlBtnStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" rx="1" />
          </svg>
        </button>
        <button
          onClick={() => window.api.windowControls.close()}
          style={controlBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'oklch(0.55 0.22 25)'; e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const controlBtnStyle: React.CSSProperties = {
  width: 46,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  transition: 'background 120ms ease-out, color 120ms ease-out',
}
