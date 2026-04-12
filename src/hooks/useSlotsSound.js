import { useEffect } from 'react'
import audioManager from '../utils/audioManager'
import { useAudioInit } from './useAudioInit'
import { usePrevious } from './usePrevious'

export function useSlotsSound(state) {
  const prevState = usePrevious(state)

  useAudioInit()

  // Sync mute state
  useEffect(() => {
    audioManager.setMuted(state.muted)
  }, [state.muted])

  // Reel stop sounds — compare previous vs current reelStops
  useEffect(() => {
    if (state.phase !== 'spinning') return
    for (let i = 0; i < 3; i++) {
      if (!prevState.reelStops[i] && state.reelStops[i]) {
        audioManager.play('slot_stop')
      }
    }
  }, [state.phase, state.reelStops, prevState.reelStops])

  // Result sounds — play on phase transition to 'result'
  useEffect(() => {
    if (prevState.phase !== 'result' && state.phase === 'result') {
      if (state.matchType === 'triple') {
        audioManager.play('slot_jackpot')
      } else if (state.matchType === 'pair') {
        audioManager.play('slot_pair')
      } else if (state.payout > 0) {
        audioManager.play('slot_win')
      }
    }
  }, [state.phase, state.matchType, state.payout, prevState.phase])
}
