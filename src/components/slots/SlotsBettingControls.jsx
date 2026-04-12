import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { sumChipStack } from '../../utils/chipUtils'
import ChipTray from '../ChipTray'
import styles from './SlotsBettingControls.module.css'

function SlotsBettingControls({
  bankroll,
  selectedChipValue,
  chipStack,
  trayRef,
  onChipTap,
  onUndo,
  onClear,
  onAllIn,
  onSpin,
}) {
  const [allInCooldown, setAllInCooldown] = useState(false)
  const cooldownRef = useRef(null)

  useEffect(() => {
    return () => clearTimeout(cooldownRef.current)
  }, [])

  const handleAllIn = useCallback(() => {
    if (allInCooldown) return
    onAllIn()
    setAllInCooldown(true)
    clearTimeout(cooldownRef.current)
    cooldownRef.current = setTimeout(() => setAllInCooldown(false), 3000)
  }, [allInCooldown, onAllIn])

  const canSpin = sumChipStack(chipStack) > 0
  const isBlocked = bankroll <= 0

  const spinClasses = [
    styles.spinButton,
    !canSpin ? styles.disabled : '',
  ].filter(Boolean).join(' ')

  const allInClasses = [
    styles.allInButton,
    allInCooldown || isBlocked ? styles.cooldown : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={styles.controls}>
      <div className={styles.chipTrayWrapper} ref={trayRef}>
        <ChipTray
          bankroll={bankroll}
          selectedChipValue={selectedChipValue}
          onChipTap={onChipTap}
          disabled={isBlocked}
          tableLevel={0}
        />
      </div>
      <div className={styles.controlRow}>
        <button
          className={styles.smallButton}
          onClick={onUndo}
          disabled={chipStack.length === 0}
        >
          UNDO
        </button>
        <button
          className={styles.smallButton}
          onClick={onClear}
          disabled={chipStack.length === 0}
        >
          CLEAR
        </button>
        <button
          className={allInClasses}
          onClick={handleAllIn}
          disabled={allInCooldown || isBlocked}
        >
          ALL IN
        </button>
      </div>
      <button
        className={spinClasses}
        onClick={onSpin}
        disabled={!canSpin}
      >
        SPIN
      </button>
    </div>
  )
}

export default memo(SlotsBettingControls)
