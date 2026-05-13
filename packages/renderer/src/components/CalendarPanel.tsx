import { useState, useMemo } from 'react'
import { useVaultStore } from '../stores/vault-store'
import { useEditorStore } from '../stores/editor-store'

export function CalendarPanel() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const openFile = useEditorStore((s) => s.openFile)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let i = 1; i <= daysInMonth; i++) cells.push(i)
    return cells
  }, [year, month])

  const today = new Date()
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  const handleDayClick = async (day: number) => {
    if (!vaultPath) return
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const path = `${vaultPath}/daily/${dateStr}.md`
    try {
      await window.api.invoke('file:read', { path })
      openFile(path)
    } catch {
      await window.api.invoke('file:create', { path, content: `# ${dateStr}\n\n`, vaultPath })
      openFile(path)
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  return (
    <div style={{ padding: '16px 12px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {year} 年 {month + 1} 月
        </span>
        <button onClick={nextMonth} style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', borderRadius: 4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Week days */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {weekDays.map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)', padding: '4px 0', fontWeight: 500 }}>{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {days.map((day, i) => (
          <button
            key={i}
            onClick={() => day && handleDayClick(day)}
            disabled={!day}
            style={{
              width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, borderRadius: 6, border: 'none', cursor: day ? 'pointer' : 'default',
              background: day && isToday(day) ? 'var(--accent)' : 'transparent',
              color: day && isToday(day) ? '#fff' : day ? 'var(--text-secondary)' : 'transparent',
              fontWeight: day && isToday(day) ? 600 : 400,
              transition: 'background 100ms',
            }}
            onMouseEnter={(e) => { if (day && !isToday(day)) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { if (day && !isToday(day)) e.currentTarget.style.background = 'transparent' }}
          >
            {day || ''}
          </button>
        ))}
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>
        点击日期打开/创建每日笔记
      </p>
    </div>
  )
}
