import { formatMoney } from '../utils/formatters'
import styles from './BankrollDisplay.module.css'

function getDebtClass(bankroll) {
  if (bankroll < -100000) return styles.debtAggressive
  if (bankroll < -50000) return styles.debtShake
  if (bankroll < -10000) return styles.debtStrong
  if (bankroll < 0) return styles.debtMild
  return ''
}

function BankrollDisplay({ bankroll }) {
  const isNegative = bankroll < 0
  const debtClass = getDebtClass(bankroll)

  return (
    <div className={styles.display}>
      <span className={`${styles.amount} ${isNegative ? styles.negative : styles.positive} ${debtClass}`}>
        {formatMoney(bankroll)}
      </span>
    </div>
  )
}

export default BankrollDisplay
