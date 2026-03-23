import { useMemo } from 'react'
import { formatMoney } from '../utils/formatters'
import styles from './DebtTracker.module.css'

const SVG_WIDTH = 400
const SVG_HEIGHT = 280
const PADDING = { top: 20, right: 80, bottom: 20, left: 15 }

const Y_ANCHORS = [
  { value: 60000, label: 'Median US Income' },
  { value: 35000, label: 'Cost of a Tesla' },
  { value: 15000, label: 'Min Wage (Annual)' },
  { value: -6000, label: 'Avg Credit Card Debt' },
  { value: -30000, label: 'Avg Student Loans' },
  { value: -100000, label: "Nat'l Debt / Person" },
  { value: -250000, label: 'Average Mortgage' },
  { value: -500000, label: 'Home Price (SF)' },
  { value: -1000000, label: '1 Lamborghini Veneno' },
]

function getSubtitle(lowestBankroll) {
  if (lowestBankroll <= -1_000_000) return 'Economists are studying this'
  if (lowestBankroll <= -500_000) return 'This chart has been forwarded to the SEC'
  if (lowestBankroll <= -100_000) return 'Your credit score just filed a restraining order'
  if (lowestBankroll <= -50_000) return 'Financial advisors hate this one trick'
  if (lowestBankroll <= -10_000) return 'A cautionary tale'
  if (lowestBankroll <= 0) return 'The house always wins. Always.'
  return 'An inspiring story of perseverance'
}

function DebtTracker({ bankrollHistory, peakBankroll, lowestBankroll, handsPlayed, totalVigPaid, onClose }) {
  const chartData = useMemo(() => {
    if (bankrollHistory.length < 2) return null

    const dataMin = Math.min(...bankrollHistory)
    const dataMax = Math.max(...bankrollHistory)

    // Ensure $0 is always visible, with padding
    let yMin = Math.min(dataMin, 0)
    let yMax = Math.max(dataMax, 10000)

    // Guard against flat line
    if (yMax === yMin) {
      yMax = yMin + 1000
      yMin = yMin - 1000
    }

    // 10% padding
    const range = yMax - yMin
    yMin = yMin - range * 0.08
    yMax = yMax + range * 0.08

    const plotWidth = SVG_WIDTH - PADDING.left - PADDING.right
    const plotHeight = SVG_HEIGHT - PADDING.top - PADDING.bottom
    const maxIndex = bankrollHistory.length - 1

    function xScale(i) {
      return PADDING.left + (maxIndex === 0 ? plotWidth / 2 : (i / maxIndex) * plotWidth)
    }

    function yScale(value) {
      return PADDING.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight
    }

    const points = bankrollHistory
      .map((val, i) => `${xScale(i).toFixed(1)},${yScale(val).toFixed(1)}`)
      .join(' ')

    const zeroY = yScale(0)
    // Gradient stop: position of $0 line as percentage of SVG height
    const zeroPercent = ((zeroY / SVG_HEIGHT) * 100).toFixed(1)

    // Filter anchors to visible range
    const visibleAnchors = Y_ANCHORS.filter(a => a.value >= yMin && a.value <= yMax)

    return { points, zeroY, zeroPercent, yMin, yMax, yScale, xScale, visibleAnchors, plotWidth }
  }, [bankrollHistory])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>YOUR FINANCIAL JOURNEY</h2>
          <button className={styles.closeButton} onClick={onClose}>&#x2715;</button>
        </div>

        <p className={styles.subtitle}>{getSubtitle(lowestBankroll)}</p>

        <div className={styles.stats}>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>Peak</span>
            <span className={styles.pillValue}>{formatMoney(peakBankroll)}</span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>Lowest</span>
            <span className={`${styles.pillValue} ${lowestBankroll < 0 ? styles.negative : ''}`}>
              {formatMoney(lowestBankroll)}
            </span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>Hands</span>
            <span className={styles.pillValue}>{handsPlayed}</span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>Vig Paid</span>
            <span className={`${styles.pillValue} ${totalVigPaid > 0 ? styles.negative : ''}`}>
              {formatMoney(totalVigPaid)}
            </span>
          </div>
        </div>

        <div className={styles.chartContainer}>
          {!chartData ? (
            <p className={styles.emptyMessage}>Play a few hands to see your journey...</p>
          ) : (
            <svg
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className={styles.chart}
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="bankrollGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={`${chartData.zeroPercent}%`} stopColor="#f0c850" />
                  <stop offset={`${chartData.zeroPercent}%`} stopColor="#e74c3c" />
                </linearGradient>
                <filter id="lineGlow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Y-axis anchor gridlines + labels */}
              {chartData.visibleAnchors.map(anchor => {
                const y = chartData.yScale(anchor.value).toFixed(1)
                return (
                  <g key={anchor.value}>
                    <line
                      x1={PADDING.left}
                      y1={y}
                      x2={SVG_WIDTH - PADDING.right}
                      y2={y}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="0.5"
                      strokeDasharray="2,4"
                    />
                    <text
                      x={SVG_WIDTH - PADDING.right + 6}
                      y={Number(y) + 3}
                      fill="rgba(255,255,255,0.35)"
                      fontSize="7"
                      fontFamily="'DM Sans', sans-serif"
                    >
                      {anchor.label}
                    </text>
                  </g>
                )
              })}

              {/* Zero line — red dashed */}
              <line
                x1={PADDING.left}
                y1={chartData.zeroY.toFixed(1)}
                x2={SVG_WIDTH - PADDING.right}
                y2={chartData.zeroY.toFixed(1)}
                stroke="#e74c3c"
                strokeWidth="0.6"
                strokeDasharray="4,3"
                opacity="0.6"
              />

              {/* Glow line (blurred duplicate for visual pop) */}
              <polyline
                points={chartData.points}
                fill="none"
                stroke="url(#bankrollGradient)"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.3"
                filter="url(#lineGlow)"
              />

              {/* Main bankroll line */}
              <polyline
                points={chartData.points}
                fill="none"
                stroke="url(#bankrollGradient)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Current position dot */}
              {bankrollHistory.length > 0 && (() => {
                const lastIdx = bankrollHistory.length - 1
                const lastVal = bankrollHistory[lastIdx]
                const cx = chartData.xScale(lastIdx).toFixed(1)
                const cy = chartData.yScale(lastVal).toFixed(1)
                const color = lastVal >= 0 ? '#f0c850' : '#e74c3c'
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="3"
                    fill={color}
                    opacity="0.9"
                  />
                )
              })()}
            </svg>
          )}
        </div>

        <div className={styles.closeFooter}>
          <button className={styles.closeFooterButton} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  )
}

export default DebtTracker
