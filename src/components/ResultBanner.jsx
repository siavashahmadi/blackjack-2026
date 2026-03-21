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

function ResultBanner({ result, bankroll, onNextHand }) {
  const config = RESULT_CONFIG[result]
  if (!config) return null

  return (
    <div className={styles.banner}>
      <span className={`${styles.resultText} ${styles[config.colorClass]}`}>
        {config.text}
      </span>
      <button className={styles.nextButton} onClick={onNextHand}>
        {getNextHandText(bankroll)}
      </button>
    </div>
  )
}

export default ResultBanner
