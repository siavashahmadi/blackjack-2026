import { memo } from 'react'
import Hand from './Hand'
import styles from './PlayerSpot.module.css'

const RESULT_LABELS = {
  blackjack: 'BJ!',
  win: 'WIN',
  dealerBust: 'WIN',
  bust: 'BUST',
  lose: 'LOSE',
  push: 'PUSH',
}

const RESULT_CLASSES = {
  blackjack: 'gold',
  win: 'green',
  dealerBust: 'green',
  bust: 'red',
  lose: 'red',
  push: 'dim',
}

const STATUS_LABELS = {
  betting: 'Betting...',
  ready: 'Ready',
  playing: 'Playing',
  standing: 'Standing',
  bust: 'Bust',
  done: 'Done',
}

const PlayerSpot = memo(function PlayerSpot({ player, isLocal, isActive, compact = false }) {
  const hasCards = player.hand && player.hand.length > 0
  const size = compact ? 'small' : 'normal'

  return (
    <div className={`${styles.spot} ${isActive ? styles.active : ''} ${compact ? styles.compact : ''}`}>
      <div className={styles.nameRow}>
        {!player.connected && <span className={styles.disconnectedDot} />}
        <span className={styles.name}>
          {player.name}
          {isLocal && <span className={styles.youBadge}>YOU</span>}
        </span>
      </div>

      <div className={styles.handArea}>
        {hasCards ? (
          <Hand cards={player.hand} animate={true} size={size} />
        ) : (
          <div className={compact ? styles.emptySmall : styles.empty} />
        )}
      </div>

      <div className={styles.info}>
        {hasCards && player.hand_value > 0 && (
          <span className={styles.value}>{player.hand_value}</span>
        )}
        {player.bet > 0 && (
          <span className={styles.bet}>${player.bet.toLocaleString()}</span>
        )}
        {player.betted_assets?.length > 0 && (
          <span className={styles.assets}>
            {player.betted_assets.map(a => a.emoji || a.name).join(' ')}
          </span>
        )}
      </div>

      <div className={styles.bankrollRow}>
        <span className={`${styles.bankroll} ${player.bankroll < 0 ? styles.inDebt : ''}`}>
          {player.bankroll < 0 ? '-' : ''}${Math.abs(player.bankroll).toLocaleString()}
        </span>
      </div>

      {player.result && (
        <span className={`${styles.result} ${styles[RESULT_CLASSES[player.result]] || ''}`}>
          {RESULT_LABELS[player.result]}
        </span>
      )}

      {!player.result && player.status && player.status !== 'idle' && (
        <span className={styles.status}>{STATUS_LABELS[player.status] || player.status}</span>
      )}
    </div>
  )
})

export default PlayerSpot
