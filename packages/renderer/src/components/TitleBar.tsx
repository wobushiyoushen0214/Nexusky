export function TitleBar() {
  return (
    <div
      style={{ height: 32, padding: '0 16px', WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="flex items-center bg-[var(--bg-base)] select-none shrink-0 border-b border-[var(--border-subtle)]"
    >
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--accent)]">
          <path d="M12 3L2 7l10 4 10-4-10-4z" fill="currentColor" opacity="0.8" />
          <path d="M2 17l10 4 10-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
          <path d="M2 12l10 4 10-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        </svg>
        <span className="text-[11px] font-medium text-[var(--text-tertiary)] tracking-widest uppercase">Nexusky</span>
      </div>
    </div>
  )
}
