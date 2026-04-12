import { memo } from 'react'
import SlotReel from './SlotReel'
import styles from './SlotMachine.module.css'

const STAGGER = [0, 300, 600]

function SlotMachine({ reels, spinning, matchType, onReelStop }) {
  return (
    <div className={styles.machine}>
      {[0, 1, 2].map((i) => (
        <SlotReel
          key={i}
          targetSymbol={reels[i]}
          spinning={spinning}
          delay={STAGGER[i]}
          onStop={() => onReelStop(i)}
        />
      ))}
      {matchType && matchType !== 'none' && (
        <div className={`${styles.matchLabel} ${styles[matchType]}`}>
          {matchType === 'triple' ? 'TRIPLE!' : 'PAIR'}
        </div>
      )}
    </div>
  )
}

export default memo(SlotMachine)
