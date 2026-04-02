import { useMemo } from 'react'
import styles from './LoanSharkFigures.module.css'

// Smooth 0-1 intensity based on how deep in debt
function getDebtIntensity(bankroll) {
  if (bankroll > -10_000) return 0
  if (bankroll <= -10_000_000) return 1
  // Log scale: -10K → 0, -10M → 1
  const minLog = Math.log10(10_000)
  const maxLog = Math.log10(10_000_000)
  const curLog = Math.log10(Math.abs(bankroll))
  return Math.min(1, Math.max(0, (curLog - minLog) / (maxLog - minLog)))
}

function LoanSharkFigures({ bankroll }) {
  const intensity = useMemo(() => getDebtIntensity(bankroll), [bankroll])

  if (intensity === 0) return null

  return (
    <div
      className={styles.container}
      style={{ '--intensity': intensity }}
      aria-hidden="true"
    >
      <div className={styles.vignette} />
      <div className={styles.redHaze} />
      <div className={styles.feltDarken} />
      {intensity > 0.4 && (
        <>
          <div className={`${styles.smoke} ${styles.smoke1}`} />
          <div className={`${styles.smoke} ${styles.smoke2}`} />
          {intensity > 0.7 && <div className={`${styles.smoke} ${styles.smoke3}`} />}
        </>
      )}
    </div>
  )
}

export default LoanSharkFigures
