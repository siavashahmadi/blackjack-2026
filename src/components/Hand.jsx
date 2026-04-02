import { memo, useRef, useMemo, useEffect } from 'react'
import Card from './Card'
import styles from './Hand.module.css'

function getCardMargin(cardCount, cardIndex, size) {
  if (cardIndex === 0) return 0
  if (size === 'small') {
    if (cardCount <= 2) return 4
    if (cardCount === 3) return -4
    return -12
  }
  if (size === 'medium') {
    if (cardCount <= 2) return 6
    if (cardCount === 3) return -2
    if (cardCount === 4) return -10
    return -18
  }
  if (cardCount <= 2) return 10
  if (cardCount === 3) return 0
  if (cardCount === 4) return -15
  if (cardCount === 5) return -25
  return -35
}

const Hand = memo(function Hand({ cards = [], hideFirst = false, animate = true, size = 'normal', dealType = 'deal', flipIndex = -1 }) {
  const cardCount = cards.length
  // Track cards already rendered so only new cards get deal animations
  const knownCardsRef = useRef(new Set())

  // Build ordered list of new card IDs so we can stagger only among new cards
  const newCardIds = useMemo(() => {
    const ids = []
    cards.forEach(c => {
      if (!knownCardsRef.current.has(c.id)) ids.push(c.id)
    })
    return new Set(ids)
  }, [cards])

  // Map new card IDs to their stagger index (0-based among new cards only)
  const newCardStagger = useMemo(() => {
    const map = new Map()
    let idx = 0
    cards.forEach(c => {
      if (newCardIds.has(c.id)) map.set(c.id, idx++)
    })
    return map
  }, [cards, newCardIds])

  useEffect(() => {
    if (cards.length === 0) {
      knownCardsRef.current.clear()
    } else {
      cards.forEach(c => knownCardsRef.current.add(c.id))
    }
  }, [cards])

  return (
    <div className={styles.hand}>
      {cards.map((card, i) => {
        const isNew = newCardIds.has(card.id)
        const isFlipping = i === flipIndex
        return (
          <div
            key={card.id}
            className={styles.handCard}
            style={{
              marginLeft: getCardMargin(cardCount, i, size),
              zIndex: i,
            }}
          >
            <Card
              card={card}
              faceDown={hideFirst && i === 0}
              index={isNew ? (newCardStagger.get(card.id) || 0) : 0}
              animate={animate && (isNew || isFlipping)}
              size={size}
              dealType={isFlipping ? 'flip' : dealType}
            />
          </div>
        )
      })}
    </div>
  )
})

export default Hand
