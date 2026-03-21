import { useMemo } from 'react'
import { CHIPS } from '../constants/chips'
import { MAX_VISUAL_CHIPS } from '../constants/gameConfig'
import { formatMoney } from '../utils/formatters'
import Chip from './Chip'
import styles from './BettingCircle.module.css'

const CHIP_MAP = Object.fromEntries(CHIPS.map(c => [c.value, c]))

function BettingCircle({ chipStack = [], bettedAssets = [], onUndo, onRemoveAsset }) {
  const { chipTotal, assetTotal, total, isEmpty, visibleChips, overflowCount } = useMemo(() => {
    const ct = chipStack.reduce((sum, v) => sum + v, 0)
    const at = bettedAssets.reduce((sum, a) => sum + a.value, 0)
    return {
      chipTotal: ct,
      assetTotal: at,
      total: ct + at,
      isEmpty: chipStack.length === 0 && bettedAssets.length === 0,
      visibleChips: chipStack.slice(-MAX_VISUAL_CHIPS),
      overflowCount: chipStack.length > MAX_VISUAL_CHIPS ? chipStack.length : 0,
    }
  }, [chipStack, bettedAssets])

  return (
    <div className={styles.wrapper}>
      <button
        className={`${styles.circle}${isEmpty ? ` ${styles.empty}` : ''}`}
        onClick={isEmpty ? undefined : onUndo}
      >
        {visibleChips.length > 0 && (
          <div className={styles.chipStack}>
            {visibleChips.map((value, i) => {
              const chip = CHIP_MAP[value] || CHIPS[0]
              const isLast = i === visibleChips.length - 1 && bettedAssets.length === 0
              return (
                <div
                  key={`${i}-${value}`}
                  className={styles.stackedChip}
                  style={{
                    transform: `translate(-50%, -50%) translate(${i}px, ${-i * 3}px)`,
                    zIndex: i,
                  }}
                >
                  <Chip
                    label={chip.label}
                    color={chip.color}
                    textColor={chip.textColor}
                    size="stack"
                    animate={isLast}
                  />
                </div>
              )
            })}
          </div>
        )}
        {bettedAssets.length > 0 && (
          <div className={styles.assetChips}>
            {bettedAssets.map((asset, i) => {
              const baseOffset = visibleChips.length
              return (
                <div
                  key={asset.id}
                  className={styles.assetChip}
                  style={{
                    transform: `translate(-50%, -50%) translate(${baseOffset + i}px, ${-(baseOffset + i) * 3}px)`,
                    zIndex: baseOffset + i + 1,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveAsset(asset.id)
                  }}
                >
                  <span className={styles.assetEmoji}>{asset.emoji}</span>
                </div>
              )
            })}
          </div>
        )}
        {overflowCount > 0 && (
          <span className={styles.badge}>&times;{overflowCount}</span>
        )}
        {isEmpty && <span className={styles.placeholder}>BET</span>}
      </button>
      {total > 0 && (
        <span className={styles.total}>{formatMoney(total)}</span>
      )}
    </div>
  )
}

export default BettingCircle
