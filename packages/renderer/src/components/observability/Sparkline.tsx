interface SparklineProps {
  points: number[]
  width?: number
  height?: number
  ariaLabel?: string
  tone?: 'good' | 'warn' | 'neutral'
}

const PAD = 1.5
const MIN_VISIBLE_RANGE = 0.05

export function Sparkline({ points, width = 96, height = 26, ariaLabel, tone = 'neutral' }: SparklineProps) {
  if (points.length === 0) {
    return (
      <svg
        className={`sparkline sparkline--${tone} sparkline--empty`}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
      />
    )
  }

  const innerW = Math.max(1, width - PAD * 2)
  const innerH = Math.max(1, height - PAD * 2)
  const actualMax = Math.max(...points)
  const yMax = Math.max(actualMax, MIN_VISIBLE_RANGE)
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0

  const yOf = (v: number) => {
    const safe = Number.isFinite(v) ? Math.max(0, Math.min(yMax, v)) : 0
    return PAD + (1 - safe / yMax) * innerH
  }
  const xOf = (i: number) => PAD + i * stepX

  const path = points.length === 1
    ? `M${xOf(0).toFixed(2)} ${yOf(points[0]).toFixed(2)} L${xOf(0).toFixed(2)} ${yOf(points[0]).toFixed(2)}`
    : 'M' + points.map((v, i) => `${xOf(i).toFixed(2)} ${yOf(v).toFixed(2)}`).join(' L')

  const fillPath = points.length > 1
    ? `${path} L${xOf(points.length - 1).toFixed(2)} ${(height - PAD).toFixed(2)} L${xOf(0).toFixed(2)} ${(height - PAD).toFixed(2)} Z`
    : null

  const lastIdx = points.length - 1
  const lastX = xOf(lastIdx)
  const lastY = yOf(points[lastIdx])

  return (
    <svg
      className={`sparkline sparkline--${tone}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      {fillPath && <path className="sparkline__fill" d={fillPath} />}
      <path className="sparkline__stroke" d={path} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="sparkline__last" cx={lastX} cy={lastY} r={1.8} />
    </svg>
  )
}
