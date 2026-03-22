import { useState, useReducer, useCallback } from 'react'
import ModeSelect from './components/ModeSelect'
import SoloGame from './components/SoloGame'
import Lobby from './components/Lobby'
import MultiplayerGame from './components/MultiplayerGame'
import { multiplayerReducer } from './reducer/multiplayerReducer'
import { multiplayerInitialState } from './reducer/multiplayerInitialState'
import { useWebSocket } from './hooks/useWebSocket'
import styles from './App.module.css'

function MultiplayerApp({ onBack }) {
  const [state, dispatch] = useReducer(multiplayerReducer, multiplayerInitialState)
  const { send, disconnect } = useWebSocket(dispatch)

  const handleLeave = useCallback(() => {
    disconnect()
    onBack()
  }, [disconnect, onBack])

  const isInGame = state.phase === 'betting' || state.phase === 'playing' ||
                   state.phase === 'dealer_turn' || state.phase === 'result'

  if (isInGame) {
    return (
      <MultiplayerGame
        state={state}
        send={send}
        dispatch={dispatch}
        onLeave={handleLeave}
      />
    )
  }

  // disconnected or lobby phase
  return (
    <Lobby
      state={state}
      send={send}
      dispatch={dispatch}
      onBack={handleLeave}
    />
  )
}

function App() {
  const [mode, setMode] = useState(null)

  return (
    <div className={styles.app}>
      {mode === null && (
        <ModeSelect
          onSelectSolo={() => setMode('solo')}
          onSelectMultiplayer={() => setMode('multiplayer')}
        />
      )}
      {mode === 'solo' && (
        <SoloGame onBack={() => setMode(null)} />
      )}
      {mode === 'multiplayer' && (
        <MultiplayerApp onBack={() => setMode(null)} />
      )}
    </div>
  )
}

export default App
