import React from 'react'
import { CHIP_MAP } from '../constants/chips'
import styles from './FlyingChip.module.css'

function FlyingChip({ value, from, to, onDone, reverse }) {
  const chip = CHIP_MAP[value] || CHIP_MAP[25]
  const dx = to.x - from.x
  const dy = to.y - from.y

  return (
    <div
      className={`${styles.chip} ${reverse ? styles.reverse : ''}`}
      style={{
        '--chip-face': chip.color,
        '--chip-rim': chip.rimColor || chip.color,
        '--chip-spot': chip.spotColor || '#e8e4d8',
        '--chip-text': chip.textColor,
        '--fly-start-x': `${from.x}px`,
        '--fly-start-y': `${from.y}px`,
        '--fly-dx': `${dx}px`,
        '--fly-dy': `${dy}px`,
      }}
      onAnimationEnd={onDone}
    >
      <span className={styles.label}>{chip.label}</span>
    </div>
  )
}

export default React.memo(FlyingChip)
