import { useState, useEffect } from 'react'
import styles from './ResultBanner.module.css'

const RESULT_CONFIG = {
  blackjack: { text: 'BLACKJACK!', colorClass: 'gold' },
  win: { text: 'YOU WIN!', colorClass: 'green' },
  dealerBust: { text: 'DEALER BUSTS!', colorClass: 'green' },
  bust: { text: 'BUST!', colorClass: 'red' },
  lose: { text: 'YOU LOSE', colorClass: 'red' },
  push: { text: 'PUSH', colorClass: 'dim' },
}

function getNextHandText(bankroll) {
  if (bankroll < -1000000) return 'THIS IS FINE 🔥'
  if (bankroll < -100000) return 'ONE MORE. JUST ONE MORE.'
  if (bankroll < -10000) return 'KEEP DIGGING 🕳️'
  if (bankroll <= 0) return 'BET AGAIN (WHY NOT)'
  return 'NEXT HAND'
}

function ResultBanner({ result, bankroll, onNextHand, autoAdvance = false, nextRoundAt }) {
  const [countdown, setCountdown] = useState(null)
  const config = RESULT_CONFIG[result]

  useEffect(() => {
    if (!autoAdvance || !nextRoundAt) return

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((nextRoundAt - Date.now()) / 1000))
      setCountdown(remaining)
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [autoAdvance, nextRoundAt])

  if (!config) return null

  return (
    <div className={styles.banner}>
      <span className={`${styles.resultText} ${styles[config.colorClass]}`}>
        {config.text}
      </span>
      {autoAdvance ? (
        <span className={styles.countdownText}>
          Next round in {countdown ?? '...'}s
        </span>
      ) : (
        <button className={styles.nextButton} onClick={onNextHand}>
          {getNextHandText(bankroll)}
        </button>
      )}
    </div>
  )
}

export default ResultBanner
