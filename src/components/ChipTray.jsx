import { useMemo } from 'react'
import { CHIPS } from '../constants/chips'
import Chip from './Chip'
import styles from './ChipTray.module.css'

function ChipTray({ bankroll, selectedChipValue, onChipTap }) {
  const availableChips = useMemo(
    () => CHIPS.filter(chip => chip.unlockThreshold === null || bankroll <= chip.unlockThreshold || (chip.unlockAbove != null && bankroll >= chip.unlockAbove)),
    [bankroll]
  )

  const isBorrowed = bankroll <= 0

  return (
    <div className={`${styles.tray} ${isBorrowed ? styles.borrowed : ''}`}>
      {availableChips.map(chip => (
        <Chip
          key={chip.value}
          label={chip.label}
          color={chip.color}
          rimColor={chip.rimColor}
          spotColor={chip.spotColor}
          textColor={chip.textColor}
          size="tray"
          selected={selectedChipValue === chip.value}
          onClick={(e) => onChipTap(chip.value, e)}
        />
      ))}
      {isBorrowed && <span className={styles.borrowedLabel}>BORROWED</span>}
    </div>
  )
}

export default ChipTray
