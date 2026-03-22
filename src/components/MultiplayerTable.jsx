import { useMemo } from 'react'
import PlayerSpot from './PlayerSpot'
import styles from './MultiplayerTable.module.css'

function MultiplayerTable({ playerStates, playerId, currentPlayerId }) {
  const { localPlayer, otherPlayers } = useMemo(() => {
    const entries = Object.entries(playerStates)
    const local = entries.find(([id]) => id === playerId)
    const others = entries.filter(([id]) => id !== playerId)
    return {
      localPlayer: local ? { ...local[1], player_id: local[0] } : null,
      otherPlayers: others.map(([id, p]) => ({ ...p, player_id: id })),
    }
  }, [playerStates, playerId])

  return (
    <div className={styles.table}>
      {/* Other players — horizontal scroll row */}
      {otherPlayers.length > 0 && (
        <div className={styles.othersRow}>
          {otherPlayers.map(player => (
            <PlayerSpot
              key={player.player_id}
              player={player}
              isLocal={false}
              isActive={player.player_id === currentPlayerId}
              compact
            />
          ))}
        </div>
      )}

      {/* Local player — full size */}
      {localPlayer && (
        <PlayerSpot
          player={localPlayer}
          isLocal
          isActive={localPlayer.player_id === currentPlayerId}
        />
      )}
    </div>
  )
}

export default MultiplayerTable
