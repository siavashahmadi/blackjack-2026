import { useCallback } from 'react'
import { formatMoney } from '../../utils/formatters'
import { useSlotsSound } from '../../hooks/useSlotsSound'
import SlotMachine from './SlotMachine'
import ScoreBar from './ScoreBar'
import styles from './MultiplayerSlots.module.css'

function MultiplayerSlots({ state, send, onLeave }) {
  const myState = state.playerStates[state.playerId] || {}
  const myReels = myState.reels || null
  const myHasSpun = myState.hasSpun || myState.has_spun || false
  const myMatchType = myState.matchType || myState.match_type || null

  // Build a minimal state object for useSlotsSound
  const soundState = {
    phase: myHasSpun && state.phase === 'spinning' ? 'result' : state.phase === 'spinning' ? 'betting' : 'result',
    reelStops: [myHasSpun, myHasSpun, myHasSpun],
    matchType: myMatchType,
    muted: state.muted,
  }
  useSlotsSound(soundState)

  const handleSpin = useCallback(() => {
    send({ type: 'slots_spin' })
  }, [send])

  const handleLeave = useCallback(() => {
    if (state.connected) {
      send({ type: 'leave_slots' })
    }
    onLeave()
  }, [send, state.connected, onLeave])

  const handlePlayAgain = useCallback(() => {
    send({ type: 'slots_play_again' })
  }, [send])

  // Build sorted player list for ScoreBar
  const scorePlayers = Object.entries(state.playerStates)
    .map(([pid, ps]) => ({
      playerId: pid,
      name: ps.name,
      totalScore: ps.total_score ?? ps.totalScore ?? 0,
    }))
    .sort((a, b) => b.totalScore - a.totalScore)

  // Build player status list for spinning phase
  const playerEntries = Object.entries(state.playerStates)

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.leaveButton} onClick={handleLeave}>
          &larr; LEAVE
        </button>
        <div className={styles.roundInfo}>
          <div className={styles.roundLabel}>
            ROUND {state.currentRound} OF {state.totalRounds}
          </div>
        </div>
        <div className={styles.potDisplay}>
          <div className={styles.potLabel}>POT</div>
          <div className={styles.potAmount}>{formatMoney(state.pot)}</div>
        </div>
      </div>

      {/* Spinning phase */}
      {state.phase === 'spinning' && (
        <div className={styles.machineArea}>
          {myHasSpun && myReels ? (
            <SlotMachine
              reels={myReels}
              spinning={false}
              matchType={myMatchType}
              onReelStop={() => {}}
            />
          ) : (
            <SlotMachine
              reels={[null, null, null]}
              spinning={false}
              matchType={null}
              onReelStop={() => {}}
            />
          )}

          {!myHasSpun ? (
            <button className={styles.spinButton} onClick={handleSpin}>
              SPIN
            </button>
          ) : (
            <div className={styles.waitingMessage}>Waiting for other players...</div>
          )}

          <div className={styles.playerStatusList}>
            {playerEntries.map(([pid, ps]) => (
              <div key={pid} className={styles.playerStatus}>
                <span className={styles.playerStatusName}>
                  {ps.name}{pid === state.playerId ? ' (you)' : ''}
                </span>
                {(ps.has_spun || ps.hasSpun) ? (
                  <span className={styles.playerStatusReady}>DONE</span>
                ) : (
                  <span className={styles.playerStatusWaiting}>spinning...</span>
                )}
              </div>
            ))}
          </div>

          {scorePlayers.length > 0 && state.currentRound > 1 && (
            <ScoreBar players={scorePlayers} currentPlayerId={state.playerId} />
          )}
        </div>
      )}

      {/* Round result */}
      {state.phase === 'round_result' && state.roundResults && (
        <div className={styles.roundResultSection}>
          <div className={styles.roundResultTitle}>
            ROUND {state.currentRound} RESULTS
          </div>

          <div className={styles.roundResultList}>
            {state.roundResults.map(r => (
              <div key={r.player_id} className={styles.roundResultItem}>
                <span className={`${styles.roundResultName} ${r.player_id === state.playerId ? styles.roundResultNameSelf : ''}`}>
                  {r.name}
                </span>
                <div className={styles.roundResultScores}>
                  {r.match_type && r.match_type !== 'none' && (
                    <span className={`${styles.roundResultMatch} ${r.match_type === 'triple' ? styles.matchTriple : styles.matchPair}`}>
                      {r.match_type}
                    </span>
                  )}
                  <span className={styles.roundResultRoundScore}>+{r.round_score}</span>
                  <span className={styles.roundResultTotalScore}>{r.total_score}</span>
                </div>
              </div>
            ))}
          </div>

          <ScoreBar players={scorePlayers} currentPlayerId={state.playerId} />

          <div className={styles.nextRoundHint}>
            {state.currentRound < state.totalRounds
              ? 'Next round starting soon...'
              : 'Calculating final results...'}
          </div>
        </div>
      )}

      {/* Final result */}
      {state.phase === 'final_result' && (
        <div className={styles.finalSection}>
          {state.isTie ? (
            <>
              <div className={`${styles.finalHeadline} ${styles.headlineTie}`}>TIE</div>
              <div className={styles.finalSubtext}>Everyone gets their buy-in back</div>
            </>
          ) : state.winnerId === state.playerId ? (
            <>
              <div className={`${styles.finalHeadline} ${styles.headlineWin}`}>YOU WIN</div>
              <div className={styles.payoutInfo}>
                <span className={styles.payoutLabel}>PAYOUT</span>
                <span className={styles.payoutAmount}>{formatMoney(state.winnerPayout)}</span>
              </div>
            </>
          ) : (
            <>
              <div className={`${styles.finalHeadline} ${styles.headlineLose}`}>YOU LOSE</div>
              <div className={styles.finalSubtext}>
                Better luck next time. You lost your {formatMoney(state.buyIn)} buy-in.
              </div>
            </>
          )}

          {state.finalStandings && (
            <div className={styles.standingsTable}>
              {state.finalStandings.map((s, i) => (
                <div key={s.player_id} className={styles.standingRow}>
                  <span className={`${styles.standingRank} ${i === 0 ? styles.standingRankFirst : ''}`}>
                    #{i + 1}
                  </span>
                  <span className={styles.standingName}>
                    {s.name}{s.player_id === state.playerId ? ' (you)' : ''}
                  </span>
                  <span className={styles.standingScore}>{s.total_score} pts</span>
                </div>
              ))}
            </div>
          )}

          <ScoreBar players={scorePlayers} currentPlayerId={state.playerId} />

          {state.isHost && (
            <button className={styles.playAgainButton} onClick={handlePlayAgain}>
              PLAY AGAIN
            </button>
          )}
          <button className={styles.leaveEndButton} onClick={handleLeave}>
            LEAVE
          </button>
        </div>
      )}
    </div>
  )
}

export default MultiplayerSlots
