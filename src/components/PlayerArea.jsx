import { useMemo } from 'react'
import Hand from './Hand'
import { handValue } from '../utils/cardUtils'
import styles from './PlayerArea.module.css'

function PlayerArea({ hand }) {
  const hasCards = hand.length > 0
  const value = useMemo(() => hasCards ? handValue(hand) : 0, [hand, hasCards])

  return (
    <div className={styles.area}>
      {hasCards && (
        <span className={styles.value}>{value}</span>
      )}
      <div className={styles.handWrapper}>
        {hasCards ? (
          <Hand cards={hand} />
        ) : (
          <div className={styles.empty} />
        )}
      </div>
      <span className={styles.label}>YOUR HAND</span>
    </div>
  )
}

export default PlayerArea
