import { useReducer, useCallback } from 'react'
import { slotsBattleReducer } from '../../reducer/slotsBattleReducer'
import { createSlotsBattleInitialState } from '../../reducer/slotsBattleInitialState'
import { useWebSocket } from '../../hooks/useWebSocket'
import SlotsLobby from './SlotsLobby'
import MultiplayerSlots from './MultiplayerSlots'

function MultiplayerSlotsApp({ onBack }) {
  const [state, dispatch] = useReducer(slotsBattleReducer, null, createSlotsBattleInitialState)
  const { send, disconnect } = useWebSocket(dispatch)

  const handleLeave = useCallback(() => {
    disconnect()
    onBack()
  }, [disconnect, onBack])

  const isInGame = state.phase === 'spinning' || state.phase === 'round_result' ||
                   state.phase === 'final_result'

  if (isInGame) {
    return (
      <MultiplayerSlots
        state={state}
        send={send}
        dispatch={dispatch}
        onLeave={handleLeave}
      />
    )
  }

  return (
    <SlotsLobby
      state={state}
      send={send}
      dispatch={dispatch}
      onBack={handleLeave}
    />
  )
}

export default MultiplayerSlotsApp
