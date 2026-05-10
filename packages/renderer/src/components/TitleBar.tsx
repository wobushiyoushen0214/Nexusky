export function TitleBar() {
  return (
    <div
      className="h-8 flex items-center px-4 bg-[var(--sidebar)] border-b border-[var(--border)] select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-[var(--primary)] opacity-80" />
        <span className="text-xs font-medium text-[var(--muted-foreground)] tracking-wide">MY NOTE</span>
      </div>
    </div>
  )
}
