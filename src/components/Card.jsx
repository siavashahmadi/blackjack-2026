import { memo } from 'react'
import { SUIT_SYMBOLS, SUIT_COLORS } from '../constants/cards'
import styles from './Card.module.css'

const Card = memo(function Card({ card, faceDown = false, index = 0, animate = true, size = 'normal' }) {
  if (!card) return null

  // Server sends {rank: "?", suit: "?"} for hidden hole card
  const isHidden = faceDown || card.rank === '?'
  const sizeClass = size === 'small' ? styles.small : ''
  const animationStyle = animate ? { animationDelay: `${index * 150}ms` } : undefined
  const cardClass = `${styles.card}${animate ? ` ${styles.dealing}` : ''}${sizeClass ? ` ${sizeClass}` : ''}`

  if (isHidden) {
    return (
      <div className={cardClass} style={animationStyle}>
        <div className={styles.back} />
      </div>
    )
  }

  const symbol = SUIT_SYMBOLS[card.suit]
  const colorClass = SUIT_COLORS[card.suit] === 'red' ? styles.red : styles.black

  return (
    <div className={cardClass} style={animationStyle}>
      <div className={`${styles.face} ${colorClass}`}>
        <div className={styles.cornerTopLeft}>
          <span className={styles.rank}>{card.rank}</span>
          <span className={styles.suitSmall}>{symbol}</span>
        </div>
        <span className={styles.centerSuit}>{symbol}</span>
        <div className={styles.cornerBottomRight}>
          <span className={styles.rank}>{card.rank}</span>
          <span className={styles.suitSmall}>{symbol}</span>
        </div>
      </div>
    </div>
  )
})

export default Card
