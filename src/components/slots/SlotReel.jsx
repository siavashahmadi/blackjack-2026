import React, { useEffect, useRef, useState } from 'react'
import { SLOT_SYMBOLS } from '../../constants/slotSymbols'
import styles from './SlotReel.module.css'

const SYMBOL_COUNT = SLOT_SYMBOLS.length // 7
const REPEAT_COUNT = 6

// Build static strip: 7 symbols × 6 repetitions = 42 items
const SYMBOL_STRIP = Array.from({ length: REPEAT_COUNT }, () => SLOT_SYMBOLS).flat()

function SlotReel({ targetSymbol, spinning, delay = 0, onStop }) {
  // Animation state machine: idle → spinning → landing → stopped
  const [animState, setAnimState] = useState('idle')
  const stripRef = useRef(null)
  const finalYRef = useRef(0)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (spinning && animState === 'idle') {
      // Start spinning
      setAnimState('spinning')

      // After delay + 800ms, begin landing
      const landTimer = setTimeout(() => {
        const targetIndex = targetSymbol.index
        const targetPos = 4 * SYMBOL_COUNT + targetIndex // land on 4th repetition
        const finalY = -(targetPos - 1)                  // offset by 1 for center row
        finalYRef.current = finalY

        // Apply the final translateY before switching to landing class
        // so the transition animates FROM current position TO final
        if (stripRef.current) {
          stripRef.current.style.transform = `translateY(calc(${finalY} * var(--symbol-height)))`
        }

        setAnimState('landing')
      }, 800 + delay)

      return () => clearTimeout(landTimer)
    }
  }, [spinning, animState, targetSymbol, delay])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reset to idle when spinning goes false after stopped
  useEffect(() => {
    if (!spinning && animState === 'stopped') {
      setAnimState('idle')
      if (stripRef.current) {
        stripRef.current.style.transform = ''
      }
    }
  }, [spinning, animState])

  function handleTransitionEnd() {
    if (animState === 'landing') {
      setAnimState('stopped')
      if (onStop) onStop()
    }
  }

  // Determine CSS class for strip
  const stripClass = [
    styles.strip,
    animState === 'spinning' ? styles.spinning : '',
    animState === 'landing' ? styles.landing : '',
    animState === 'stopped' ? styles.stopped : '',
    animState === 'idle' ? styles.idle : '',
  ]
    .filter(Boolean)
    .join(' ')

  // Inline style for final position during landing/stopped
  const stripStyle =
    animState === 'landing' || animState === 'stopped'
      ? { transform: `translateY(calc(${finalYRef.current} * var(--symbol-height)))` }
      : {}

  return (
    <div className={styles.reel}>
      <div
        ref={stripRef}
        className={stripClass}
        style={stripStyle}
        onTransitionEnd={handleTransitionEnd}
      >
        {SYMBOL_STRIP.map((symbol, i) => (
          <div key={i} className={styles.symbol} aria-hidden="true">
            {symbol.emoji}
          </div>
        ))}
      </div>
      <div className={styles.payline} aria-hidden="true" />
    </div>
  )
}

export default React.memo(SlotReel)
