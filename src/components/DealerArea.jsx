import { useMemo } from 'react'
import Hand from './Hand'
import DealerSpeechBubble from './DealerSpeechBubble'
import { handValue, cardValue } from '../utils/cardUtils'
import styles from './DealerArea.module.css'

function DealerArea({ hand, phase, hideHoleCard, dealerMessage }) {
  const hasCards = hand.length > 0

  const displayValue = useMemo(() => {
    if (!hasCards) return ''
    if (hideHoleCard) {
      return hand.length > 1 ? cardValue(hand[1]) : ''
    }
    return handValue(hand)
  }, [hand, hasCards, hideHoleCard])

  return (
    <div className={styles.area}>
      <DealerSpeechBubble message={dealerMessage} />
      <span className={styles.label}>DEALER</span>
      <div className={styles.handWrapper}>
        {hasCards ? (
          <Hand cards={hand} hideFirst={hideHoleCard} />
        ) : (
          <div className={styles.empty} />
        )}
      </div>
      {hasCards && (
        <span className={styles.value}>{displayValue}</span>
      )}
    </div>
  )
}

export default DealerArea
